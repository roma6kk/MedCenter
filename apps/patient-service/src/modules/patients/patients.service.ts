import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { FHIR_CLIENT, type FhirClient } from '@medcenter/fhir';

import { PatientAccessService } from '../access/patient-access.service';
import { ownPatientId } from '../access/patient-identity';
import type { PatientResponseDto } from './dto/patient-response.dto';
import { toPatientResponseDto } from './mappers/patient.mapper';

/**
 * Patient cards (API §3.1–3.2, FR-001/BR-006). Read-only: Patients are created
 * by auth-service on registration (API §2.2.6), so this service writes nothing
 * to HAPI and therefore records no `AuditEvent` (ADR-014 covers writes).
 */
@Injectable()
export class PatientsService {
  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly access: PatientAccessService,
  ) {}

  /** API §3.1 — the patient comes from the token only, never from the request (ADR-013). */
  async getMePatient(claims: JwtClaims): Promise<PatientResponseDto> {
    return this.readProfile(ownPatientId(claims));
  }

  /** API §3.2 — compartment first, then the read, so a foreign id never reaches HAPI. */
  async getById(id: string, claims: JwtClaims): Promise<PatientResponseDto> {
    await this.access.assertCanRead(claims, id);
    return this.readProfile(id);
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
