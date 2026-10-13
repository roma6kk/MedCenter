import { ForbiddenException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { hasScope, type JwtClaims } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { compartmentViolation, ownPatientId, practitionerRoleIdOf, referencesResource } from './patient-identity';

/**
 * Appointment states that prove a care relationship (API §3: «активный Appointment»).
 * `proposed`/`pending`/`waitlist` were never confirmed; `cancelled`, `noshow`
 * and `entered-in-error` never brought the doctor and the patient together.
 */
export const CARE_APPOINTMENT_STATUSES: ReadonlyArray<string> = ['booked', 'arrived', 'checked-in', 'fulfilled'];

/** Encounter states that prove a care relationship; `cancelled`/`entered-in-error`/`unknown` do not. */
export const CARE_ENCOUNTER_STATUSES: ReadonlyArray<string> = [
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
];

/** Scope each role must hold to read a patient card (API §0 scope matrix). */
const READ_SCOPE_BY_ROLE: Readonly<Record<string, string>> = {
  [Role.PATIENT]: SMART_SCOPES.PATIENT_READ,
  [Role.DOCTOR]: SMART_SCOPES.USER_READ,
  [Role.ADMIN]: SMART_SCOPES.USER_READ,
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
  const individuals = participantsOf(resource).map((participant) => participant.individual?.reference);
  return (
    resource.resourceType === 'Encounter' &&
    CARE_ENCOUNTER_STATUSES.includes(String(resource['status'])) &&
    referencesResource(subject, 'Patient', patientId) &&
    individuals.some((reference) => referencesResource(reference, 'PractitionerRole', roleId))
  );
}

/**
 * Read access to one patient's card (API §3.2–3.3, ADR-013 defence in depth):
 * - PATIENT (`patient/*.read`): only the patient of the token;
 * - DOCTOR (`user/*.read`): only a patient they share an Appointment or
 *   Encounter with — proven by a HAPI search **and** re-checked in process, so
 *   a search parameter HAPI silently ignores can never widen the result;
 * - ADMIN (`user/*.read`): any patient.
 *
 * The compartment is decided before the patient is read, so a caller without
 * access cannot tell an unknown id (404) from a foreign one (403).
 */
@Injectable()
export class PatientAccessService {
  private readonly logger = new Logger(PatientAccessService.name);

  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  async assertCanRead(claims: JwtClaims, patientId: string): Promise<void> {
    this.assertReadScope(claims);
    if (claims.role === Role.ADMIN) {
      return;
    }
    const isAllowed =
      claims.role === Role.PATIENT
        ? ownPatientId(claims) === patientId
        : await this.sharesCare(patientId, practitionerRoleIdOf(claims));
    if (!isAllowed) {
      this.logger.warn({ sub: claims.sub, role: claims.role, patientId }, 'Patient compartment violation');
      throw compartmentViolation('patient is outside the caller compartment');
    }
  }

  private assertReadScope(claims: JwtClaims): void {
    const required = READ_SCOPE_BY_ROLE[claims.role];
    if (required === undefined) {
      throw new ForbiddenException({ errorCode: 'FORBIDDEN_ROLE', message: `Role ${claims.role} cannot read patients` });
    }
    if (!hasScope(claims, required)) {
      throw new ForbiddenException({ errorCode: 'FORBIDDEN_SCOPE', message: `Missing required scope ${required}` });
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

  /**
   * One matching resource is enough to prove the relationship. HAPI answers a
   * reference search on an unknown (client-assigned) Patient id with 404; that
   * means "no shared care", not NOT_FOUND, so the doctor learns nothing about
   * which ids exist. Any other upstream failure propagates (502/504).
   */
  private async searchJoined(resourceType: string, params: Record<string, unknown>): Promise<ReadonlyArray<FhirResource>> {
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
