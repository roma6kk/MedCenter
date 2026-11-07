import type { SmokeRole } from './smoke-types';

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

export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
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
  route('GET', '/api/v1/me/patient', PATIENT),
  route('PATCH', '/api/v1/me/patient', PATIENT),
  route('GET', `/api/v1/patients/${ID}`, 'any'),
  route('GET', `/api/v1/patients/${ID}/related`, 'any'),
  route('GET', '/api/v1/me/consent', PATIENT),
  route('POST', '/api/v1/me/consent/revoke', PATIENT),
  route('GET', `/api/v1/patients/${ID}/consent`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent/revoke`, STAFF),
  route('POST', `/api/v1/patients/${ID}/consent/scan`, STAFF),
  route('GET', `/api/v1/patients/${ID}/consent/scan/${ID}`, STAFF),
  route('GET', '/api/v1/rooms', STAFF),
  route('POST', '/api/v1/admin/rooms', ADMIN),
  route('PATCH', `/api/v1/admin/rooms/${ID}`, ADMIN),
  route('GET', `/api/v1/admin/rooms/${ID}/usage`, ADMIN),
  route('DELETE', `/api/v1/admin/rooms/${ID}`, ADMIN),
  route('GET', '/api/v1/admin/services', ADMIN),
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
  route('POST', '/api/v1/appointments', PATIENT),
  route('GET', '/api/v1/appointments', PATIENT),
  route('GET', `/api/v1/appointments/${ID}`, 'any'),
  route('POST', `/api/v1/appointments/${ID}/cancel`, ['PATIENT', 'ADMIN']),
  route('GET', '/api/v1/doctor/appointments', DOCTOR),
  route('POST', `/api/v1/doctor/appointments/${ID}/noshow`, DOCTOR),
  route('POST', '/api/v1/encounters', DOCTOR),
  route('GET', `/api/v1/encounters/${ID}`, STAFF),
  route('POST', `/api/v1/encounters/${ID}/complete`, DOCTOR),
  route('GET', `/api/v1/patients/${ID}/history`, PATIENT_OR_DOCTOR),
  route('GET', `/api/v1/patients/${ID}/prescriptions`, PATIENT_OR_DOCTOR),
  route('GET', '/api/v1/me/history', PATIENT),
  route('GET', '/api/v1/me/prescriptions', PATIENT),
  route('GET', '/api/v1/notifications', PATIENT),
  route('GET', '/api/v1/notifications/unread-count', PATIENT),
  route('POST', `/api/v1/notifications/${ID}/read`, PATIENT),
  route('POST', '/api/v1/notifications/read-all', PATIENT),
  route('GET', '/api/v1/admin/analytics/appointments', ADMIN),
  route('GET', '/api/v1/admin/analytics/encounters', ADMIN),
  route('GET', '/api/v1/admin/analytics/services-popularity', ADMIN),
  route('GET', '/api/v1/admin/audit', ADMIN),
];

const SCOPE_FAMILY: Readonly<Record<SmokeRole, 'user' | 'patient'>> = { ADMIN: 'user', DOCTOR: 'user', PATIENT: 'patient' };
const ALL_ROLES: readonly SmokeRole[] = ['PATIENT', 'DOCTOR', 'ADMIN'];

export type ExpectedRefusal = 'FORBIDDEN_ROLE' | 'FORBIDDEN_ROLE_OR_SCOPE';

export interface RoleProbe {
  readonly role: SmokeRole;
  readonly expected: ExpectedRefusal;
}

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
