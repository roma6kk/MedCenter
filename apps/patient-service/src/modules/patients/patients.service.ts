import { ConflictException, Inject, Injectable } from '@nestjs/common';
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

import { readPatient } from '../../shared/read-patient';
import { PatientAccessService } from '../access/patient-access.service';
import { ownPatientId } from '../access/patient-identity';
import type { PatientResponseDto } from './dto/patient-response.dto';
import { toPatientResponseDto } from './mappers/patient.mapper';

const AUDIT_SOURCE = 'patient-service';

type ContactPoint = Readonly<Record<string, unknown>>;

function withPhone(patient: FhirResource, phone: string): ReadonlyArray<ContactPoint> {
  const telecom = Array.isArray(patient['telecom']) ? (patient['telecom'] as ReadonlyArray<ContactPoint>) : [];
  const isLivePhone = (point: ContactPoint): boolean => point['system'] === 'phone' && point['use'] !== 'old';
  const use = telecom.find(isLivePhone)?.['use'] ?? 'mobile';
  return [...telecom.filter((point) => !isLivePhone(point)), { system: 'phone', value: phone, use }];
}

@Injectable()
export class PatientsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
    private readonly readAudit: PatientReadAudit,
  ) {}

  async getMePatient(claims: JwtClaims): Promise<PatientResponseDto> {
    return this.readProfile(ownPatientId(claims));
  }

  // Compartment first, then the read, so a foreign id never reaches HAPI.
  async getById(id: string, claims: JwtClaims, requestId?: string): Promise<PatientResponseDto> {
    return this.readAudit.audited(claims, id, { interaction: 'read', source: AUDIT_SOURCE, requestId }, async () => {
      await this.access.assertCanRead(claims, id);
      return this.readProfile(id);
    });
  }

  async updateMyPhone(
    claims: JwtClaims,
    version: string,
    phone: string,
    requestId?: string,
  ): Promise<PatientResponseDto> {
    const id = ownPatientId(claims);
    const current = await readPatient(this.fhir, id);
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

  private async readProfile(id: string): Promise<PatientResponseDto> {
    return toPatientResponseDto(await readPatient(this.fhir, id));
  }
}

function versionFromEtag(bundle: FhirResource): string | undefined {
  const entries = (bundle['entry'] as ReadonlyArray<{ response?: { etag?: unknown } }> | undefined) ?? [];
  const etag = entries[0]?.response?.etag;
  return typeof etag === 'string' ? /"([^"]+)"/.exec(etag)?.[1] : undefined;
}
