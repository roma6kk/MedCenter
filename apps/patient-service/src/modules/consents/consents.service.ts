import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import {
  Role,
  type ConsentResponse,
  type ConsentScanUploadResponse,
  type CreateConsentRequest,
  type PatientConsentResponse,
  type RevokeConsentRequest,
} from '@medcenter/contracts';
import {
  buildConsent,
  buildConsentWriteAuditEvent,
  buildScanReadAuditEvent,
  commitTransaction,
  FHIR_CLIENT,
  FhirClientError,
  findActiveConsent,
  idFromLocation,
  isConsentInForce,
  listActiveConsents,
  listConsents,
  PatientReadAudit,
  revokeConsent,
  toConsentResponse,
  versionOf,
  type FhirClient,
  type FhirResource,
  type TransactionWrite,
} from '@medcenter/fhir';

import { readPersonName } from '../../shared/fhir-datatypes.mapper';
import { readPatient } from '../../shared/read-patient';
import { PatientAccessService } from '../access/patient-access.service';
import { ownPatientId, practitionerRoleIdOf } from '../access/patient-identity';
import { sha1Base64, validateScanUpload, type UploadedScan } from './consent-scan';

const AUDIT_SOURCE = 'patient-service';
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

interface ScanContent {
  readonly contentType: string;
  readonly data: Buffer;
}

function invalid(field: string, message: string): BadRequestException {
  return new BadRequestException({
    errorCode: 'VALIDATION_ERROR',
    message: `${field}: ${message}`,
    details: [{ field, message }],
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof FhirClientError && error.getStatus() === 404;
}

function notFound(what: string): NotFoundException {
  return new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: ${what}` });
}

function isInTheFuture(moment: string, now: Date): boolean {
  if (DATE_ONLY.test(moment)) {
    return moment > new Date(now.getTime() + MAX_UTC_OFFSET_MS).toISOString().slice(0, 10);
  }
  return new Date(moment).getTime() > now.getTime() + FUTURE_TOLERANCE_MS;
}

function startOf(consent: FhirResource): number | undefined {
  const period = (consent['provision'] as { period?: { start?: string } } | undefined)?.period;
  const time = new Date(period?.start ?? '').getTime();
  return Number.isNaN(time) ? undefined : time;
}

function belongsToPatient(binary: FhirResource, patientId: string): boolean {
  const reference = (binary['securityContext'] as { reference?: unknown } | undefined)?.reference;
  return (
    typeof reference === 'string' &&
    (reference === `Patient/${patientId}` || reference.endsWith(`/Patient/${patientId}`))
  );
}

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  async getMine(claims: JwtClaims): Promise<PatientConsentResponse> {
    return this.history(ownPatientId(claims));
  }

  async revokeMine(claims: JwtClaims, requestId?: string): Promise<ConsentResponse> {
    return this.closeActive(ownPatientId(claims), claims, {}, requestId);
  }

  async getForPatient(
    patientId: string,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<PatientConsentResponse> {
    return this.readAudit.audited(
      claims,
      patientId,
      { interaction: 'search-type', source: AUDIT_SOURCE, requestId },
      async () => {
        await this.access.assertCanRead(claims, patientId);
        await readPatient(this.fhir, patientId);
        return this.history(patientId);
      },
    );
  }

  async create(
    patientId: string,
    dto: CreateConsentRequest,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentResponse> {
    await this.access.assertCanWrite(claims, patientId);
    const signer = await this.signerOf(dto, claims);
    if (isInTheFuture(dto.signedAt, new Date())) {
      throw invalid('signedAt', 'must not be in the future');
    }
    this.assertRepresentativeFields(dto);
    await readPatient(this.fhir, patientId);
    if ((await findActiveConsent(this.fhir, patientId)) !== null) {
      throw new ConflictException({
        errorCode: 'CONSENT_ALREADY_ACTIVE',
        message:
          'CONSENT_ALREADY_ACTIVE: the patient already has an active consent; revoke it first',
      });
    }
    const performerRef = await this.performerOf(patientId, dto);
    const scan = await this.readOwnScan(patientId, dto.scanId);

    const consent = buildConsent({
      patientId,
      status: dto.status ?? 'active',
      formNumber: dto.formNumber.trim(),
      signedAt: dto.signedAt,
      performerRef,
      consenterType: dto.consenterType,
      representativeDocument: dto.representativeDocument?.trim(),
      signer,
      scan: { binaryId: dto.scanId, contentType: scan.contentType, hash: scan.hash },
    });
    const consentRef = `urn:uuid:${randomUUID()}`;
    const response = await commitTransaction(
      this.fhir,
      [
        { method: 'POST', url: 'Consent', fullUrl: consentRef, resource: consent },
        this.auditWrite('create', consentRef, patientId, claims, requestId),
      ],
      'CONFLICT',
    );
    return toConsentResponse({ ...consent, id: createdId(response, 'Consent') });
  }

  async revoke(
    patientId: string,
    dto: RevokeConsentRequest,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentResponse> {
    await this.access.assertCanWrite(claims, patientId);
    await readPatient(this.fhir, patientId);
    return this.closeActive(patientId, claims, dto, requestId);
  }

  async uploadScan(
    patientId: string,
    file: UploadedScan | undefined,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentScanUploadResponse> {
    await this.access.assertCanWrite(claims, patientId);
    const scan = validateScanUpload(file);
    await readPatient(this.fhir, patientId);
    const binary: FhirResource = {
      resourceType: 'Binary',
      contentType: scan.contentType,
      data: scan.buffer.toString('base64'),
      securityContext: { reference: `Patient/${patientId}` },
    };
    const binaryRef = `urn:uuid:${randomUUID()}`;
    const response = await commitTransaction(
      this.fhir,
      [
        { method: 'POST', url: 'Binary', fullUrl: binaryRef, resource: binary },
        this.auditWrite('create', binaryRef, patientId, claims, requestId),
      ],
      'CONFLICT',
    );
    return {
      scanId: createdId(response, 'Binary'),
      contentType: scan.contentType,
      size: scan.size,
      hash: scan.hash,
    };
  }

  // The download is journalled before the bytes are returned and a failed audit stops the answer: a scan carries passport data.
  async readScan(
    patientId: string,
    scanId: string,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ScanContent> {
    const binaryRef = `Binary/${scanId}`;
    const journal = (outcome: 'success' | 'denied'): Promise<FhirResource> =>
      this.fhir.create(
        'AuditEvent',
        buildScanReadAuditEvent({
          outcome,
          actorSub: claims.sub,
          binaryRef,
          patientRef: `Patient/${patientId}`,
          source: AUDIT_SOURCE,
          requestId,
        }),
      );
    const journalRefusal = async (): Promise<void> => {
      try {
        await journal('denied');
      } catch (error) {
        this.logger.error(
          { err: error, requestId, binaryRef },
          'Refused scan read was not journalled',
        );
      }
    };

    try {
      await this.access.assertCanRead(claims, patientId);
    } catch (error) {
      await journalRefusal();
      throw error;
    }
    const binary = await this.readBinary(scanId);
    if (binary === undefined || !belongsToPatient(binary, patientId)) {
      if (binary !== undefined) {
        await journalRefusal();
      }
      throw notFound(`scan ${scanId} does not exist`);
    }
    await journal('success');
    return {
      contentType: String(binary['contentType']),
      data: Buffer.from(String(binary['data'] ?? ''), 'base64'),
    };
  }

  private async history(patientId: string): Promise<PatientConsentResponse> {
    const all = await listConsents(this.fhir, patientId);
    const now = new Date();
    const active = all.find((consent) => isConsentInForce(consent, patientId, now));
    return {
      active: active === undefined ? null : toConsentResponse(active),
      history: all.map(toConsentResponse),
    };
  }

  private async closeActive(
    patientId: string,
    claims: JwtClaims,
    dto: Partial<RevokeConsentRequest>,
    requestId?: string,
  ): Promise<ConsentResponse> {
    const now = new Date();
    const revokedAt = dto.revokedAt ?? now.toISOString();
    if (isInTheFuture(revokedAt, now)) {
      throw invalid('revokedAt', 'must not be in the future');
    }
    // Concurrent writes can leave more than one consent in force; a revocation closes every one of them.
    const inForce = await listActiveConsents(this.fhir, patientId, now);
    if (inForce.length === 0) {
      throw notFound(`patient ${patientId} has no active consent to revoke`);
    }
    if (inForce.some((consent) => new Date(revokedAt).getTime() < (startOf(consent) ?? -Infinity))) {
      throw invalid('revokedAt', 'must not be before the consent began');
    }
    const closed = inForce.map((consent) =>
      revokeConsent(consent, { revokedAt, applicationNumber: dto.applicationNumber?.trim() }),
    );
    await commitTransaction(
      this.fhir,
      inForce.flatMap((consent, index) => [
        {
          method: 'PUT' as const,
          url: `Consent/${consent.id ?? ''}`,
          resource: closed[index],
          ifMatch: versionOf(consent),
        },
        this.auditWrite('update', `Consent/${consent.id ?? ''}`, patientId, claims, requestId),
      ]),
      'CONFLICT',
    );
    return toConsentResponse(closed[0] as FhirResource);
  }

  private auditWrite(
    interaction: 'create' | 'update',
    entityRef: string,
    patientId: string,
    claims: JwtClaims,
    requestId?: string,
  ): TransactionWrite {
    return {
      method: 'POST',
      url: 'AuditEvent',
      resource: buildConsentWriteAuditEvent({
        interaction,
        actorSub: claims.sub,
        entityRef,
        patientRef: `Patient/${patientId}`,
        source: AUDIT_SOURCE,
        requestId,
      }),
    };
  }

  private async signerOf(
    dto: CreateConsentRequest,
    claims: JwtClaims,
  ): Promise<{ reference?: string; name?: string }> {
    const name = dto.signedByName?.trim();
    if (claims.role === Role.DOCTOR) {
      const roleId = practitionerRoleIdOf(claims);
      const stored = name !== undefined && name !== '' ? name : await this.practitionerNameOf(roleId);
      return {
        reference: `PractitionerRole/${roleId}`,
        ...(stored === undefined ? {} : { name: stored }),
      };
    }
    if (name === undefined || name === '') {
      throw invalid('signedByName', 'is required: the medical worker who signed the form');
    }
    return { name };
  }

  private async practitionerNameOf(roleId: string): Promise<string | undefined> {
    try {
      const result = await this.fhir.search('PractitionerRole', {
        _id: roleId,
        _include: 'PractitionerRole:practitioner',
      });
      const practitioner = (result.entry ?? [])
        .map((entry) => entry.resource)
        .find((resource) => resource.resourceType === 'Practitioner');
      const person = readPersonName(practitioner?.['name']);
      const initials = [person.firstName, person.middleName]
        .filter((part): part is string => part !== undefined && part !== '')
        .map((part) => `${part.charAt(0).toUpperCase()}.`);
      const short = [person.lastName, ...initials].filter((part) => part !== '').join(' ');
      return short || person.fullName || undefined;
    } catch (error) {
      this.logger.warn({ err: error, roleId }, 'Name of the signing doctor was not read; the reference is stored');
      return undefined;
    }
  }

  private assertRepresentativeFields(dto: CreateConsentRequest): void {
    if (dto.consenterType === 'self') {
      if (dto.relatedPersonId !== undefined) {
        throw invalid('relatedPersonId', 'must be absent when the patient signed themselves');
      }
      return;
    }
    if (dto.relatedPersonId === undefined) {
      throw invalid('relatedPersonId', 'is required when someone acts for the patient');
    }
    if (dto.representativeDocument === undefined || dto.representativeDocument.trim() === '') {
      throw invalid('representativeDocument', 'is required: the document proving the authority');
    }
  }

  private async performerOf(patientId: string, dto: CreateConsentRequest): Promise<string> {
    if (dto.consenterType === 'self' || dto.relatedPersonId === undefined) {
      return `Patient/${patientId}`;
    }
    let related: FhirResource;
    try {
      related = await this.fhir.read('RelatedPerson', dto.relatedPersonId);
    } catch (error) {
      if (isNotFound(error)) {
        throw invalid('relatedPersonId', 'no such related person');
      }
      throw error;
    }
    const reference = (related['patient'] as { reference?: unknown } | undefined)?.reference;
    if (related.resourceType !== 'RelatedPerson' || reference !== `Patient/${patientId}`) {
      throw invalid('relatedPersonId', 'is not a related person of this patient');
    }
    return `RelatedPerson/${dto.relatedPersonId}`;
  }

  private async readOwnScan(
    patientId: string,
    scanId: string,
  ): Promise<{ contentType: string; hash: string }> {
    const binary = await this.readBinary(scanId);
    if (binary === undefined || !belongsToPatient(binary, patientId)) {
      throw invalid('scanId', 'no such scan for this patient; upload it first (3.10)');
    }
    const bytes = Buffer.from(String(binary['data'] ?? ''), 'base64');
    return {
      contentType: String(binary['contentType']),
      hash: sha1Base64(bytes),
    };
  }

  private async readBinary(scanId: string): Promise<FhirResource | undefined> {
    try {
      const binary = await this.fhir.read('Binary', scanId);
      return binary.resourceType === 'Binary' ? binary : undefined;
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

function createdId(bundle: FhirResource, resourceType: string): string {
  const entries =
    (bundle['entry'] as ReadonlyArray<{ response?: { location?: string } }> | undefined) ?? [];
  const location = entries.find((entry) => entry.response?.location?.includes(`${resourceType}/`) === true)?.response
    ?.location;
  return location === undefined ? '' : idFromLocation(location);
}
