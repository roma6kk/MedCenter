export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export const ROLE_LANDING: Readonly<Record<UserRole, string>> = {
  PATIENT: '/home',
  DOCTOR: '/doctor/appointments',
  ADMIN: '/admin/analytics',
};

const ROLE_PREFIXES: Readonly<Record<UserRole, ReadonlyArray<string>>> = {
  PATIENT: ['/home', '/booking', '/appointments', '/medcard', '/history', '/prescriptions', '/profile', '/notifications'],
  DOCTOR: ['/doctor', '/encounters', '/patients'],
  ADMIN: ['/admin'],
};

export function parseUserRole(value: unknown): UserRole | null {
  return value === 'PATIENT' || value === 'DOCTOR' || value === 'ADMIN' ? value : null;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`);
}

export function isPathAllowedForRole(role: UserRole, path: string): boolean {
  const otherRoles = (Object.keys(ROLE_PREFIXES) as UserRole[]).filter((candidate) => candidate !== role);
  return !otherRoles.some((other) => ROLE_PREFIXES[other].some((prefix) => matchesPrefix(path, prefix)));
}

export function resolvePostLoginPath(role: UserRole | null, requested: string): string {
  if (role === null) return requested;
  return isPathAllowedForRole(role, requested) ? requested : ROLE_LANDING[role];
}
