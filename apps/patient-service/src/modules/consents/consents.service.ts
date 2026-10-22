import { createHash, randomUUID } from 'node:crypto';

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
  listConsents,
  PatientReadAudit,
  revokeConsent,
  toConsentResponse,
  versionOf,
  type FhirClient,
  type FhirResource,
  type TransactionWrite,
} from '@medcenter/fhir';

import { PatientAccessService } from '../access/patient-access.service';
import { ownPatientId, practitionerRoleIdOf } from '../access/patient-identity';
import { validateScanUpload, type UploadedScan } from './consent-scan';

const AUDIT_SOURCE = 'patient-service';
/** Clock skew tolerated on a moment the client supplies (signing, revocation). */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** A date-only value is the clinic's local day; UTC+14 is the furthest ahead any local day can be. */
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

/** The bytes of a stored scan and the type they were stored with. */
export interface ScanContent {
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

/** `true` when `moment` (a date or a dateTime) lies beyond what the clock allows for "already happened". */
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

/**
 * Patient consent to the electronic medical record (API §3.4–3.11, ADR-019).
 * `Consent` is written together with its `AuditEvent` in one FHIR transaction
 * (ADR-014); reads of another patient's consent go through `PatientReadAudit`,
 * and a scan download is always journalled, before the bytes leave (fail-closed).
 */
@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  /** API §3.4 — the patient comes from the token only (ADR-013); reading one's own consent is not journalled. */
  async getMine(claims: JwtClaims): Promise<PatientConsentResponse> {
    return this.history(ownPatientId(claims));
  }

  /** API §3.6 — the patient revokes their own consent; the written application follows later. */
  async revokeMine(claims: JwtClaims, requestId?: string): Promise<ConsentResponse> {
    return this.closeActive(ownPatientId(claims), claims, {}, requestId);
  }

  /** API §3.7 — a doctor's or administrator's read, and any refused read, is journalled (ADR-018). */
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
        await this.assertPatientExists(patientId);
        return this.history(patientId);
      },
    );
  }

  /** API §3.8 — a paper consent or a written refusal, with the scan of the form. */
  async create(
    patientId: string,
    dto: CreateConsentRequest,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentResponse> {
    await this.access.assertCanWrite(claims, patientId);
    const signer = this.signerOf(dto, claims);
    if (isInTheFuture(dto.signedAt, new Date())) {
      throw invalid('signedAt', 'must not be in the future');
    }
    this.assertRepresentativeFields(dto);
    await this.assertPatientExists(patientId);
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

  /** API §3.9 — the written revocation, with the number of the application. */
  async revoke(
    patientId: string,
    dto: RevokeConsentRequest,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentResponse> {
    await this.access.assertCanWrite(claims, patientId);
    await this.assertPatientExists(patientId);
    return this.closeActive(patientId, claims, dto, requestId);
  }

  /** API §3.10 — the scan is stored as a `Binary` tied to the patient; the write is journalled in the same transaction. */
  async uploadScan(
    patientId: string,
    file: UploadedScan | undefined,
    claims: JwtClaims,
    requestId?: string,
  ): Promise<ConsentScanUploadResponse> {
    await this.access.assertCanWrite(claims, patientId);
    const scan = validateScanUpload(file);
    await this.assertPatientExists(patientId);
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

  /**
   * API §3.11 — every download is journalled by any user, success or refusal. The
   * success event is written before the bytes are returned and its failure stops
   * the answer: a scan carries passport data, so an unjournalled read is not allowed.
   */
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

  /** 3.6 and 3.9: the consent in force is closed in place (`inactive`, period end) with its `update` AuditEvent. */
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
    const active = await findActiveConsent(this.fhir, patientId, now);
    if (active === null) {
      throw notFound(`patient ${patientId} has no active consent to revoke`);
    }
    const start = startOf(active);
    if (start !== undefined && new Date(revokedAt).getTime() < start) {
      throw invalid('revokedAt', 'must not be before the consent began');
    }
    const closed = revokeConsent(active, {
      revokedAt,
      applicationNumber: dto.applicationNumber?.trim(),
    });
    const consentId = active.id ?? '';
    await commitTransaction(
      this.fhir,
      [
        {
          method: 'PUT',
          url: `Consent/${consentId}`,
          resource: closed,
          ifMatch: versionOf(active),
        },
        this.auditWrite('update', `Consent/${consentId}`, patientId, claims, requestId),
      ],
      'CONFLICT',
    );
    return toConsentResponse(closed);
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

  /** The medical worker who signed the form: a doctor is the token's PractitionerRole, an administrator names them. */
  private signerOf(
    dto: CreateConsentRequest,
    claims: JwtClaims,
  ): { reference?: string; name?: string } {
    const name = dto.signedByName?.trim();
    if (claims.role === Role.DOCTOR) {
      return {
        reference: `PractitionerRole/${practitionerRoleIdOf(claims)}`,
        ...(name === undefined ? {} : { name }),
      };
    }
    if (name === undefined || name === '') {
      throw invalid('signedByName', 'is required: the medical worker who signed the form');
    }
    return { name };
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

  /** `Patient/{id}` for a self-signed form, otherwise the verified `RelatedPerson` of this patient. */
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

  /** The uploaded scan of this patient, with its hash recomputed from the stored bytes. */
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
      hash: createHash('sha1').update(bytes).digest('base64'),
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

  /** A clerk's or doctor's call on an unknown id is a 404, not an empty result. */
  private async assertPatientExists(patientId: string): Promise<void> {
    const patient = await this.fhir.read('Patient', patientId);
    if (patient.resourceType !== 'Patient') {
      throw notFound(`Patient ${patientId} does not exist`);
    }
  }
}

/** Id of the resource a transaction created, from the `location` of its response entry. */
function createdId(bundle: FhirResource, resourceType: string): string {
  const entries =
    (bundle['entry'] as ReadonlyArray<{ response?: { location?: string } }> | undefined) ?? [];
  for (const entry of entries) {
    const location = entry.response?.location;
    if (location?.includes(`${resourceType}/`) === true) {
      return idFromLocation(location);
    }
  }
  return '';
}
