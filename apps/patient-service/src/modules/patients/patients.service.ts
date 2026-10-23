import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import {
  buildConsentWriteAuditEvent,
  commitTransaction,
  FHIR_CLIENT,
  PatientReadAudit,
  versionOf,
  type FhirClient,
  type FhirResource,
} from '@medcenter/fhir';

import { PatientAccessService } from '../access/patient-access.service';
import { ownPatientId } from '../access/patient-identity';
import type { PatientResponseDto } from './dto/patient-response.dto';
import { toPatientResponseDto } from './mappers/patient.mapper';

const AUDIT_SOURCE = 'patient-service';

type ContactPoint = Readonly<Record<string, unknown>>;

/** The patient's live phone replaced by `phone`; the e-mail, other systems and numbers marked `old` stay. */
function withPhone(patient: FhirResource, phone: string): ReadonlyArray<ContactPoint> {
  const telecom = Array.isArray(patient['telecom']) ? (patient['telecom'] as ReadonlyArray<ContactPoint>) : [];
  const isLivePhone = (point: ContactPoint): boolean => point['system'] === 'phone' && point['use'] !== 'old';
  const use = telecom.find(isLivePhone)?.['use'] ?? 'mobile';
  return [...telecom.filter((point) => !isLivePhone(point)), { system: 'phone', value: phone, use }];
}

/**
 * Patient cards (API §3.1–3.2, FR-001/BR-006). Patients are created by
 * auth-service on registration (API §2.2.6); the only write here is the
 * patient's own phone (API §3.12). Reads of another patient's card are journalled by `PatientReadAudit`
 * (ADR-018, D-3).
 */
@Injectable()
export class PatientsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  /** API §3.1 — the patient comes from the token only, never from the request (ADR-013). */
  async getMePatient(claims: JwtClaims): Promise<PatientResponseDto> {
    return this.readProfile(ownPatientId(claims));
  }

  /**
   * API §3.2 — compartment first, then the read, so a foreign id never reaches HAPI.
   * A doctor's or administrator's read, and any refused read, is journalled (ADR-018).
   */
  async getById(id: string, claims: JwtClaims, requestId?: string): Promise<PatientResponseDto> {
    return this.readAudit.audited(claims, id, { interaction: 'read', source: AUDIT_SOURCE, requestId }, async () => {
      await this.access.assertCanRead(claims, id);
      return this.readProfile(id);
    });
  }

  /**
   * API §3.12 — the patient changes their own phone and nothing else. `version` is the
   * `meta.versionId` the client last saw (`If-Match`): a newer stored version, or a
   * write that HAPI refuses, is `409 CONFLICT` (ADR-012). The `Patient` and its
   * `AuditEvent` are one transaction (ADR-014); the number itself is not copied into the audit.
   */
  async updateMyPhone(
    claims: JwtClaims,
    version: string,
    phone: string,
    requestId?: string,
  ): Promise<PatientResponseDto> {
    const id = ownPatientId(claims);
    const current = await this.fhir.read('Patient', id);
    if (current.resourceType !== 'Patient') {
      throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Patient ${id} does not exist` });
    }
    if (versionOf(current) !== `W/"${version}"`) {
      throw new ConflictException({
        errorCode: 'CONFLICT',
        message: 'CONFLICT: the patient card was changed; reload it and repeat the edit',
      });
    }
    const next: FhirResource = { ...current, telecom: withPhone(current, phone) };
    const response = await commitTransaction(
      this.fhir,
      [
        { method: 'PUT', url: `Patient/${id}`, resource: next, ifMatch: versionOf(current) },
        {
          method: 'POST',
          url: 'AuditEvent',
          resource: buildConsentWriteAuditEvent({
            interaction: 'update',
            actorSub: claims.sub,
            entityRef: `Patient/${id}`,
            patientRef: `Patient/${id}`,
            source: AUDIT_SOURCE,
            requestId,
          }),
        },
      ],
      'CONFLICT',
    );
    return toPatientResponseDto({ ...next, meta: { versionId: versionFromEtag(response) } });
  }

  /** HAPI 404/410 surfaces as `404 NOT_FOUND` through `FhirClientError`. */
  private async readProfile(id: string): Promise<PatientResponseDto> {
    const patient = await this.fhir.read('Patient', id);
    if (patient.resourceType !== 'Patient') {
      throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Patient ${id} does not exist` });
    }
    return toPatientResponseDto(patient);
  }
}

/** `meta.versionId` HAPI reports for the first entry of a transaction response (`etag`: `W/"4"`). */
function versionFromEtag(bundle: FhirResource): string | undefined {
  const entries = (bundle['entry'] as ReadonlyArray<{ response?: { etag?: unknown } }> | undefined) ?? [];
  const etag = entries[0]?.response?.etag;
  return typeof etag === 'string' ? /"([^"]+)"/.exec(etag)?.[1] : undefined;
}
