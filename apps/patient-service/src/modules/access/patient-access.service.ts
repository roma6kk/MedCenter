import { ForbiddenException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { hasScope, type JwtClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import {
  compartmentViolation,
  ownPatientId,
  practitionerRoleIdOf,
  referencesResource,
} from './patient-identity';

export const CARE_APPOINTMENT_STATUSES: ReadonlyArray<string> = [
  'booked',
  'arrived',
  'checked-in',
  'fulfilled',
];

export const CARE_ENCOUNTER_STATUSES: ReadonlyArray<string> = [
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
];

const READ_SCOPE_BY_ROLE: Readonly<Record<string, string>> = {
  [Role.PATIENT]: SMART_SCOPES.PATIENT_READ,
  [Role.DOCTOR]: SMART_SCOPES.USER_READ,
  [Role.ADMIN]: SMART_SCOPES.USER_READ,
};

const WRITE_SCOPE_BY_ROLE: Readonly<Record<string, string>> = {
  [Role.DOCTOR]: SMART_SCOPES.USER_WRITE,
  [Role.ADMIN]: SMART_SCOPES.USER_WRITE,
};

interface ParticipantLike {
  readonly actor?: { readonly reference?: unknown };
  readonly individual?: { readonly reference?: unknown };
}

function participantsOf(resource: FhirResource): ReadonlyArray<ParticipantLike> {
  const participants = resource['participant'];
  return Array.isArray(participants) ? (participants as ReadonlyArray<ParticipantLike>) : [];
}

function appointmentJoins(resource: FhirResource, patientId: string, roleId: string): boolean {
  const actors = participantsOf(resource).map((participant) => participant.actor?.reference);
  return (
    resource.resourceType === 'Appointment' &&
    CARE_APPOINTMENT_STATUSES.includes(String(resource['status'])) &&
    actors.some((reference) => referencesResource(reference, 'Patient', patientId)) &&
    actors.some((reference) => referencesResource(reference, 'PractitionerRole', roleId))
  );
}

function encounterJoins(resource: FhirResource, patientId: string, roleId: string): boolean {
  const subject = (resource['subject'] as { reference?: unknown } | undefined)?.reference;
  const individuals = participantsOf(resource).map(
    (participant) => participant.individual?.reference,
  );
  return (
    resource.resourceType === 'Encounter' &&
    CARE_ENCOUNTER_STATUSES.includes(String(resource['status'])) &&
    referencesResource(subject, 'Patient', patientId) &&
    individuals.some((reference) => referencesResource(reference, 'PractitionerRole', roleId))
  );
}

// Compartment is decided before the patient is read: a caller cannot tell an unknown id (404) from a foreign one (403).
@Injectable()
export class PatientAccessService {
  private readonly logger = new Logger(PatientAccessService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async assertCanRead(claims: JwtClaims, patientId: string): Promise<void> {
    this.assertScope(claims, READ_SCOPE_BY_ROLE);
    await this.assertInCompartment(claims, patientId);
  }

  async assertCanWrite(claims: JwtClaims, patientId: string): Promise<void> {
    this.assertScope(claims, WRITE_SCOPE_BY_ROLE);
    await this.assertInCompartment(claims, patientId);
  }

  private async assertInCompartment(claims: JwtClaims, patientId: string): Promise<void> {
    if (claims.role === Role.ADMIN) {
      return;
    }
    const isAllowed =
      claims.role === Role.PATIENT
        ? ownPatientId(claims) === patientId
        : await this.sharesCare(patientId, practitionerRoleIdOf(claims));
    if (!isAllowed) {
      this.logger.warn(
        { sub: claims.sub, role: claims.role, patientId },
        'Patient compartment violation',
      );
      throw compartmentViolation('patient is outside the caller compartment');
    }
  }

  private assertScope(claims: JwtClaims, scopeByRole: Readonly<Record<string, string>>): void {
    const required = scopeByRole[claims.role];
    if (required === undefined) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN_ROLE',
        message: `Role ${claims.role} is not allowed here`,
      });
    }
    if (!hasScope(claims, required)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN_SCOPE',
        message: `Missing required scope ${required}`,
      });
    }
  }

  private async sharesCare(patientId: string, roleId: string): Promise<boolean> {
    const appointments = await this.searchJoined('Appointment', {
      patient: `Patient/${patientId}`,
      actor: `PractitionerRole/${roleId}`,
      status: CARE_APPOINTMENT_STATUSES.join(','),
    });
    if (appointments.some((resource) => appointmentJoins(resource, patientId, roleId))) {
      return true;
    }
    const encounters = await this.searchJoined('Encounter', {
      patient: `Patient/${patientId}`,
      participant: `PractitionerRole/${roleId}`,
      status: CARE_ENCOUNTER_STATUSES.join(','),
    });
    return encounters.some((resource) => encounterJoins(resource, patientId, roleId));
  }

  // HAPI answers a reference search on an unknown Patient id with 404: that is "no shared care", not NOT_FOUND (no id existence leak).
  private async searchJoined(
    resourceType: string,
    params: Record<string, unknown>,
  ): Promise<ReadonlyArray<FhirResource>> {
    try {
      const result = await this.fhir.search(resourceType, { ...params, _count: 1 });
      return (result.entry ?? []).map((entry) => entry.resource);
    } catch (error) {
      if (error instanceof FhirClientError && error.getStatus() === HttpStatus.NOT_FOUND) {
        return [];
      }
      throw error;
    }
  }
}
