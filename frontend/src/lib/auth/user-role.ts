/**
 * user-role — the role claim of the access token and where each role lands after login
 * (frontend-design-spec §1: "Редирект после входа").
 *
 * UI gating only: the BFF guard layer is the authority (ADR-009).
 */

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export const ROLE_LANDING: Readonly<Record<UserRole, string>> = {
  PATIENT: '/booking',
  DOCTOR: '/doctor/appointments',
  ADMIN: '/admin/analytics',
};

/** Route prefixes that only one role may open. Everything else (/, /doctors, …) is shared. */
const ROLE_PREFIXES: Readonly<Record<UserRole, ReadonlyArray<string>>> = {
  PATIENT: ['/booking', '/appointments', '/history', '/prescriptions', '/profile', '/notifications'],
  DOCTOR: ['/doctor', '/encounters', '/patients'],
  ADMIN: ['/admin'],
};

export function parseUserRole(value: unknown): UserRole | null {
  return value === 'PATIENT' || value === 'DOCTOR' || value === 'ADMIN' ? value : null;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`);
}

/** `false` when `path` belongs to a route group of another role (so the role guard would answer 403). */
export function isPathAllowedForRole(role: UserRole, path: string): boolean {
  const otherRoles = (Object.keys(ROLE_PREFIXES) as UserRole[]).filter((candidate) => candidate !== role);
  return !otherRoles.some((other) => ROLE_PREFIXES[other].some((prefix) => matchesPrefix(path, prefix)));
}

/** Where to send the user after login: the requested path if the role may open it, else the role landing page. */
export function resolvePostLoginPath(role: UserRole | null, requested: string): string {
  if (role === null) return requested;
  return isPathAllowedForRole(role, requested) ? requested : ROLE_LANDING[role];
}
