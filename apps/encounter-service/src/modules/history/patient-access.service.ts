import { ForbiddenException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { patientRefFromClaims, practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import { referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference } from '../../common/fhir/fhir-reference';
import { resourcesOfType } from '../../common/fhir/fhir-search';
import { appointmentParties, encounterPractitionerRoleRefs } from '../encounters/encounter-access';

/** Encounter states of a real visit; `cancelled` and `entered-in-error` prove no care. */
const CARE_ENCOUNTER_STATUSES = ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished'];
/** Appointment states in which the doctor did (or will) see the patient; cancelled and no-show do not count. */
const CARE_APPOINTMENT_STATUSES = ['booked', 'arrived', 'checked-in', 'fulfilled'];

function compartmentViolation(message: string): ForbiddenException {
  return new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: `COMPARTMENT_VIOLATION: ${message}` });
}

function isCareEncounter(encounter: FhirResource, patientRef: string, roleRef: string): boolean {
  return (
    CARE_ENCOUNTER_STATUSES.includes(String(encounter['status'])) &&
    canonicalReference(referenceField(encounter, 'subject'), 'Patient') === patientRef &&
    encounterPractitionerRoleRefs(encounter).includes(roleRef)
  );
}

function isCareAppointment(appointment: FhirResource, patientRef: string, roleRef: string): boolean {
  const parties = appointmentParties(appointment);
  return (
    CARE_APPOINTMENT_STATUSES.includes(String(appointment['status'])) &&
    parties.patientRef === patientRef &&
    parties.practitionerRoleRefs.includes(roleRef)
  );
}

/**
 * Who may read a patient's history and prescriptions (API §7.4/7.5, ADR-013):
 * the patient themselves (compartment from the token), a doctor who shares an
 * encounter or an appointment with the patient, or an admin.
 */
@Injectable()
export class PatientAccessService {
  private readonly logger = new Logger(PatientAccessService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /** `Patient/{patientId}` once the caller is allowed to read it; `403` otherwise. */
  async resolveReadablePatient(claims: JwtClaims, patientId: string): Promise<string> {
    const patientRef = `Patient/${patientId}`;
    switch (claims.role) {
      case Role.PATIENT:
        if (patientRefFromClaims(claims) !== patientRef) {
          throw compartmentViolation('the record belongs to another patient');
        }
        return patientRef;
      case Role.DOCTOR:
        await this.assertSharesCare(practitionerRoleRefFromClaims(claims), patientRef);
        return patientRef;
      case Role.ADMIN:
        return patientRef;
      default:
        throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} cannot read patient records` });
    }
  }

  private async assertSharesCare(roleRef: string, patientRef: string): Promise<void> {
    const encounterQuery = { patient: patientRef, participant: roleRef, status: CARE_ENCOUNTER_STATUSES.join(',') };
    if (await this.hasMatch('Encounter', encounterQuery, (encounter) => isCareEncounter(encounter, patientRef, roleRef))) {
      return;
    }
    const appointmentQuery = { patient: patientRef, actor: roleRef, status: CARE_APPOINTMENT_STATUSES.join(',') };
    if (await this.hasMatch('Appointment', appointmentQuery, (appointment) => isCareAppointment(appointment, patientRef, roleRef))) {
      return;
    }
    throw compartmentViolation('the practitioner has no encounter or appointment with this patient');
  }

  /**
   * One hit is enough, and it is re-checked in-process (type, status, patient and
   * doctor): a search parameter the server ignored must never widen the
   * compartment, so an unverifiable hit fails closed. HAPI answers a reference
   * search on an unknown client-assigned id with 404: that is "no shared care"
   * (403), so a doctor cannot probe which ids exist.
   */
  private async hasMatch(
    resourceType: string,
    params: Readonly<Record<string, string>>,
    confirms: (resource: FhirResource) => boolean,
  ): Promise<boolean> {
    try {
      const result = await this.fhir.search(resourceType, { ...params, _count: 1 });
      return resourcesOfType(result, resourceType).some(confirms);
    } catch (error) {
      if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
        this.logger.warn({ resourceType, upstreamStatus: error.upstreamStatus }, 'FHIR search answered 404; treating as no shared care');
        return false;
      }
      throw error;
    }
  }
}
