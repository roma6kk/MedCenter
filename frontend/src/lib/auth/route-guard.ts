/**
 * route-guard — pure, unit-testable matcher for the edge middleware.
 *
 * The middleware itself (`src/middleware.ts`) is a thin wrapper: all
 * allow/deny decisions live here so Jest can cover the boundary pipeline
 * without importing `next/server`.
 */

export const PROTECTED_PREFIXES: ReadonlyArray<string> = [
  '/home',
  '/booking',
  '/appointments',
  '/medcard',
  '/history',
  '/prescriptions',
  '/profile',
  '/notifications',
  '/doctor',
  '/encounters',
  '/patients',
  '/admin',
];

export function isProtectedPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  // Exact match or segment boundary only: `/bookingx` MUST NOT match `/booking`.
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function shouldRedirectToLogin(path: string, hasSession: boolean): boolean {
  if (hasSession) return false;
  if (!isProtectedPath(path)) return false;
  return true;
}
