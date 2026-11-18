import type { FhirResource } from '@medcenter/fhir';

export const AUTH_USER_IDENTIFIER_SYSTEM = 'https://api.medcenter.by/sid/auth-user';

export const SYSTEM_ACTOR = 'system:auth-service';

type UserAuditAction = 'create' | 'update';

export interface AuditActor {
  readonly sub: string;
  readonly requestId?: string;
}

export interface UserAuditParams {
  readonly action: UserAuditAction;
  readonly actor: AuditActor;
  readonly userId: string;
  readonly event: string;
  readonly resourceRefs?: ReadonlyArray<string>;
  readonly outcome?: 'succeeded' | 'failed';
  readonly outcomeDesc?: string;
}

const ACTION_CODE: Readonly<Record<UserAuditAction, 'C' | 'U'>> = { create: 'C', update: 'U' };

const OUTCOME_CODE = { succeeded: '0', failed: '8' } as const;

export const SYSTEM_OBJECT = {
  system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type',
  code: '2',
  display: 'System Object',
} as const;

const PATIENT_OBJECT_ROLE = {
  system: 'http://terminology.hl7.org/CodeSystem/object-role',
  code: '1',
  display: 'Patient',
} as const;

const REQUEST_ID_TYPE = {
  system: 'https://profiles.ihe.net/ITI/BALP/CodeSystem/BasicAuditEntityType',
  code: 'XrequestId',
} as const;

export function requestIdEntities(requestId: string | undefined): ReadonlyArray<Record<string, unknown>> {
  return requestId === undefined ? [] : [{ what: { identifier: { value: requestId } }, type: REQUEST_ID_TYPE }];
}

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
