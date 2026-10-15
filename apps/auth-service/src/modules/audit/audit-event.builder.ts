import type { FhirResource } from '@medcenter/fhir';

/** Identifier system of `auth.user` ids inside FHIR resources (`AuditEvent.entity`, `Patient.identifier`). */
export const AUTH_USER_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/auth-user';

/** Actor written by the service itself (bootstrap), not by an authenticated user. */
export const SYSTEM_ACTOR = 'system:auth-service';

export type UserAuditAction = 'create' | 'update';

/** Who made the change, and the correlation id of the request that made it. */
export interface AuditActor {
  readonly sub: string;
  readonly requestId?: string;
}

export interface UserAuditParams {
  readonly action: UserAuditAction;
  readonly actor: AuditActor;
  /** The `auth.user` account that changed. */
  readonly userId: string;
  /** Machine-readable event, e.g. `user.registered`, `user.deactivated`. */
  readonly event: string;
  /** FHIR resources touched by the change (`Patient/{id}`, `PractitionerRole/{id}`). */
  readonly resourceRefs?: ReadonlyArray<string>;
  /**
   * `failed`: the change stands in the `auth` schema although a follow-up step
   * did not complete (the `Patient` sync, and the undo after it). `outcomeDesc`
   * then says why.
   */
  readonly outcome?: 'succeeded' | 'failed';
  readonly outcomeDesc?: string;
}

const ACTION_CODE: Readonly<Record<UserAuditAction, 'C' | 'U'>> = { create: 'C', update: 'U' };

/** R4 `AuditEvent.outcome`: `0` success, `8` serious failure. */
const OUTCOME_CODE = { succeeded: '0', failed: '8' } as const;

export const SYSTEM_OBJECT = {
  system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
  code: '2',
  display: 'System Object',
} as const;

/** Marks the entity whose data was touched, as appointment-/encounter-service do (FR-021). */
const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

/** IHE BALP entity type the analytics journal reads the request id from. */
const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

export function requestIdEntities(requestId: string | undefined): ReadonlyArray<Record<string, unknown>> {
  return requestId === undefined ? [] : [{ what: { identifier: { value: requestId } }, type: REQUEST_ID_TYPE }];
}

/**
 * R4 `AuditEvent` for a change of an `auth.user` account (FR-021, ADR-014).
 * Same envelope as appointment-/encounter-service so the analytics journal
 * reads one format: the requesting agent carries the token `sub`, FHIR
 * resources come first in `entity` (the journal shows the first relative
 * reference), followed by the account itself as a System Object.
 */
export function buildUserAuditEvent(params: UserAuditParams): FhirResource {
  return {
    resourceType: 'AuditEvent',
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    subtype: [{ system: 'http://hl7.org/fhir/restful-interaction', code: params.action }],
    action: ACTION_CODE[params.action],
    recorded: new Date().toISOString(),
    outcome: OUTCOME_CODE[params.outcome ?? 'succeeded'],
    ...(params.outcomeDesc !== undefined ? { outcomeDesc: params.outcomeDesc } : {}),
    agent: [{ who: { identifier: { value: params.actor.sub } }, requestor: true }],
    source: { observer: { display: 'auth-service' } },
    entity: [
      ...(params.resourceRefs ?? []).map((reference) => ({
        what: { reference },
        ...(reference.startsWith('Patient/') ? { role: PATIENT_OBJECT_ROLE } : {}),
      })),
      {
        what: { identifier: { system: AUTH_USER_IDENTIFIER_SYSTEM, value: params.userId } },
        type: SYSTEM_OBJECT,
        name: 'auth.user',
        description: params.event,
      },
      ...requestIdEntities(params.actor.requestId),
    ],
  };
}
