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
  // Exact match or segment boundary only: `/bookingx` must not match `/booking`.
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function shouldRedirectToLogin(path: string, hasSession: boolean): boolean {
  if (hasSession) return false;
  if (!isProtectedPath(path)) return false;
  return true;
}
