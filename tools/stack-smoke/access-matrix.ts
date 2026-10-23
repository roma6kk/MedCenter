import type { SmokeRole } from './smoke-types';

/** A protected route and who may call it (API spec, access column). `any` = every authenticated role. */
export interface ProtectedRoute {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly roles: readonly SmokeRole[] | 'any';
}

const ID = '1';
const UUID = '00000000-0000-4000-8000-000000000000';
const ADMIN: readonly SmokeRole[] = ['ADMIN'];
const DOCTOR: readonly SmokeRole[] = ['DOCTOR'];
const PATIENT: readonly SmokeRole[] = ['PATIENT'];
const PATIENT_OR_DOCTOR: readonly SmokeRole[] = ['PATIENT', 'DOCTOR'];
const STAFF: readonly SmokeRole[] = ['DOCTOR', 'ADMIN'];
const VALUE_SET = encodeURIComponent('https://fhir.by/ValueSet/atc');

function route(method: ProtectedRoute['method'], path: string, roles: ProtectedRoute['roles']): ProtectedRoute {
  return { method, path, roles };
}

/** Every non-public `/api/v1` route of the 8 services. The "wrong role" check picks a role outside `roles`. */
export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  // auth-service
  route('GET', '/api/v1/me', 'any'),
  route('POST', '/api/v1/admin/users', ADMIN),
  route('GET', '/api/v1/admin/users', ADMIN),
  route('GET', `/api/v1/admin/users/${UUID}`, ADMIN),
  route('PATCH', `/api/v1/admin/users/${UUID}`, ADMIN),
  route('DELETE', `/api/v1/admin/users/${UUID}`, ADMIN),
  route('GET', '/api/v1/terminology/value-sets', ADMIN),
  route('GET', `/api/v1/terminology/value-sets/${VALUE_SET}/$expand`, STAFF),
  route('GET', `/api/v1/terminology/expand?system=${VALUE_SET}`, STAFF),
  route('GET', '/api/v1/terminology/validate?system=https://fhir.by/CodeSystem/x&code=A00', STAFF),
  route('POST', '/api/v1/admin/terminology/import', ADMIN),
  // patient-service
  route('GET', '/api/v1/me/patient', PATIENT),
  route('PATCH', '/api/v1/me/patient', PATIENT),
  route('GET', `/api/v1/patients/${ID}`, 'any'),
  route('GET', `/api/v1/patients/${ID}/related`, 'any'),
  // patient-service, consent to the EMR (3.4-3.11): the patient only 3.4 and 3.6; a DOCTOR only for a linked patient (compartment, checked in the consent chain)
  route('GET', '/api/v1/me/consent', PATIENT),
  route('POST', '/api/v1/me/consent/revoke', PATIENT),
  route('GET', `/api/v1/patients/${ID}/consent`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent/revoke`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent/scan`, STAFF),
  route('GET', `/api/v1/patients/${ID}/consent/scan/${ID}`, STAFF),
  // practitioner-service
  route('GET', '/api/v1/rooms', STAFF),
  route('POST', '/api/v1/admin/rooms', ADMIN),
  route('PATCH', `/api/v1/admin/rooms/${ID}`, ADMIN),
  route('GET', `/api/v1/admin/rooms/${ID}/usage`, ADMIN),
  route('DELETE', `/api/v1/admin/rooms/${ID}`, ADMIN),
  // catalog-service
  route('POST', '/api/v1/admin/services', ADMIN),
  route('PATCH', `/api/v1/admin/services/${ID}`, ADMIN),
  route('DELETE', `/api/v1/admin/services/${ID}`, ADMIN),
  route('POST', '/api/v1/admin/schedules', ADMIN),
  route('GET', '/api/v1/admin/schedules', ADMIN),
  route('PATCH', `/api/v1/admin/schedules/${ID}`, ADMIN),
  route('DELETE', `/api/v1/admin/schedules/${ID}`, ADMIN),
  route('POST', `/api/v1/admin/schedules/${ID}/generate`, ADMIN),
  route('GET', `/api/v1/admin/schedules/${ID}/slots`, ADMIN),
  route('GET', '/api/v1/doctor/schedule', DOCTOR),
  // appointment-service
  route('POST', '/api/v1/appointments', PATIENT),
  route('GET', '/api/v1/appointments', PATIENT),
  route('GET', `/api/v1/appointments/${ID}`, 'any'),
  route('POST', `/api/v1/appointments/${ID}/cancel`, ['PATIENT', 'ADMIN']),
  route('GET', '/api/v1/doctor/appointments', DOCTOR),
  route('POST', `/api/v1/doctor/appointments/${ID}/noshow`, DOCTOR),
  // encounter-service
  route('POST', '/api/v1/encounters', DOCTOR),
  route('GET', `/api/v1/encounters/${ID}`, STAFF),
  route('POST', `/api/v1/encounters/${ID}/complete`, DOCTOR),
  route('GET', `/api/v1/patients/${ID}/history`, PATIENT_OR_DOCTOR),
  route('GET', `/api/v1/patients/${ID}/prescriptions`, PATIENT_OR_DOCTOR),
  route('GET', '/api/v1/me/history', PATIENT),
  route('GET', '/api/v1/me/prescriptions', PATIENT),
  // notification-service
  route('GET', '/api/v1/notifications', PATIENT),
  route('GET', '/api/v1/notifications/unread-count', PATIENT),
  route('POST', `/api/v1/notifications/${ID}/read`, PATIENT),
  route('POST', '/api/v1/notifications/read-all', PATIENT),
  // analytics-service
  route('GET', '/api/v1/admin/analytics/appointments', ADMIN),
  route('GET', '/api/v1/admin/analytics/encounters', ADMIN),
  route('GET', '/api/v1/admin/analytics/services-popularity', ADMIN),
  route('GET', '/api/v1/admin/audit', ADMIN),
];

/** The scope family a role's token carries: ADMIN and DOCTOR hold `user/*`, PATIENT holds `patient/*`. */
const SCOPE_FAMILY: Readonly<Record<SmokeRole, 'user' | 'patient'>> = { ADMIN: 'user', DOCTOR: 'user', PATIENT: 'patient' };
const ALL_ROLES: readonly SmokeRole[] = ['PATIENT', 'DOCTOR', 'ADMIN'];

/**
 * `FORBIDDEN_ROLE`: the probe passes the scope check, so only RoleGuard can refuse it.
 * `FORBIDDEN_ROLE_OR_SCOPE`: the probe lacks the route's scopes, so either guard may answer first.
 */
export type ExpectedRefusal = 'FORBIDDEN_ROLE' | 'FORBIDDEN_ROLE_OR_SCOPE';

export interface RoleProbe {
  readonly role: SmokeRole;
  readonly expected: ExpectedRefusal;
}

/**
 * Every role the route does not admit, as a probe. A probe whose scope family equals that of an admitted
 * role holds the route's scopes (a DOCTOR on an admin route: same `user/*`), so a refusal can only come
 * from RoleGuard and must be exactly `FORBIDDEN_ROLE`: if `@RequiresRoles` were dropped from a
 * scope-protected route, that probe would get 200 and fail. The other probes (a PATIENT on a staff route,
 * a doctor on a patient route) lack the scopes, so the scope check may answer first.
 */
export function roleProbesFor(entry: ProtectedRoute): RoleProbe[] {
  if (entry.roles === 'any') {
    return [];
  }
  const admitted = entry.roles;
  const families = new Set(admitted.map((role) => SCOPE_FAMILY[role]));
  return ALL_ROLES.filter((role) => !admitted.includes(role)).map((role) => ({
    role,
    expected: families.has(SCOPE_FAMILY[role]) ? 'FORBIDDEN_ROLE' : 'FORBIDDEN_ROLE_OR_SCOPE',
  }));
}
