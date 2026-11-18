import { ForbiddenException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';
import { Role } from '@medcenter/contracts';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { patientRefFromClaims, practitionerRoleRefFromClaims } from '../../common/access/claims-identity';
import { referenceField } from '../../common/fhir/fhir-read';
import { canonicalReference } from '../../common/fhir/fhir-reference';
import { resourcesOfType } from '../../common/fhir/fhir-search';
import { appointmentParties, compartmentViolation, encounterPractitionerRoleRefs } from '../encounters/encounter-access';

const CARE_ENCOUNTER_STATUSES = ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished'];
const CARE_APPOINTMENT_STATUSES = ['booked', 'arrived', 'checked-in', 'fulfilled'];

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

@Injectable()
export class PatientAccessService {
  private readonly logger = new Logger(PatientAccessService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

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
        // ADR-018: an administrator provides no care, so a patient's medical data is closed to them.
        throw compartmentViolation('an administrator has no access to medical data');
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

  // Fails closed: hits are re-checked in-process, so an ignored search parameter never widens the compartment. A 404 on an unknown id is 'no shared care' (403): ids cannot be probed.
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
