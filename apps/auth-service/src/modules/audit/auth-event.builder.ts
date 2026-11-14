import type { FhirResource } from '@medcenter/fhir';

import { AUTH_USER_IDENTIFIER_SYSTEM, SYSTEM_OBJECT, requestIdEntities } from './audit-event.builder';

export type AuthAuditKind = 'login' | 'login-failed' | 'login-throttled' | 'logout' | 'session-idle';

export interface AuthAuditParams {
  readonly kind: AuthAuditKind;
  /** The account, when the event is attributable to one. Never a typed login name. */
  readonly userId?: string;
  readonly requestId?: string;
}

const DCM_SYSTEM = 'http://dicom.nema.org/resources/ontology/DCM';

const USER_AUTHENTICATION = { system: DCM_SYSTEM, code: '110114', display: 'User Authentication' } as const;
const LOGIN = { system: DCM_SYSTEM, code: '110122', display: 'Login' } as const;
const LOGOUT = { system: DCM_SYSTEM, code: '110123', display: 'Logout' } as const;

const OUTCOME_SUCCESS = '0';
const OUTCOME_MINOR_FAILURE = '4';

// Login and logout carry no outcomeDesc; the others tell the journal which refusal it was.
const SUBTYPE: Readonly<Record<AuthAuditKind, typeof LOGIN | typeof LOGOUT>> = {
  login: LOGIN,
  'login-failed': LOGIN,
  'login-throttled': LOGIN,
  logout: LOGOUT,
  'session-idle': LOGOUT,
};

const OUTCOME_DESC: Readonly<Partial<Record<AuthAuditKind, string>>> = {
  'login-failed': 'login-failed',
  'login-throttled': 'login-throttled',
  'session-idle': 'session-idle',
};

export function buildAuthAuditEvent(params: AuthAuditParams): FhirResource {
  const outcomeDesc = OUTCOME_DESC[params.kind];
  const failed = params.kind === 'login-failed' || params.kind === 'login-throttled';
  return {
    resourceType: 'AuditEvent',
    type: USER_AUTHENTICATION,
    subtype: [SUBTYPE[params.kind]],
    action: 'E',
    recorded: new Date().toISOString(),
    outcome: failed ? OUTCOME_MINOR_FAILURE : OUTCOME_SUCCESS,
    ...(outcomeDesc !== undefined ? { outcomeDesc } : {}),
    agent: [{ ...(params.userId !== undefined ? { who: { identifier: { value: params.userId } } } : {}), requestor: true }],
    source: { observer: { display: 'auth-service' } },
    entity: [
      ...(params.userId !== undefined
        ? [{ what: { identifier: { system: AUTH_USER_IDENTIFIER_SYSTEM, value: params.userId } }, type: SYSTEM_OBJECT, name: 'auth.user' }]
        : []),
      ...requestIdEntities(params.requestId),
    ],
  };
}
