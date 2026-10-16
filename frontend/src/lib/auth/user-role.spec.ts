import { isPathAllowedForRole, parseUserRole, resolvePostLoginPath, ROLE_LANDING } from './user-role';

describe('parseUserRole', () => {
  it.each([['PATIENT'], ['DOCTOR'], ['ADMIN']])('should accept %s', (role) => {
    expect(parseUserRole(role)).toBe(role);
  });

  it.each([['SUPERUSER'], ['patient'], [''], [null], [undefined], [7]])('should reject %p', (role) => {
    expect(parseUserRole(role)).toBeNull();
  });
});

describe('isPathAllowedForRole', () => {
  it.each([
    ['PATIENT', '/booking'],
    ['PATIENT', '/appointments/a1'],
    ['PATIENT', '/doctors/d1'],
    ['DOCTOR', '/doctor/appointments?from=2026-10-16'],
    ['DOCTOR', '/encounters/e1'],
    ['DOCTOR', '/patients/p1'],
    ['ADMIN', '/admin/users'],
    ['ADMIN', '/'],
  ] as const)('should allow %s on %s', (role, path) => {
    expect(isPathAllowedForRole(role, path)).toBe(true);
  });

  it.each([
    ['PATIENT', '/admin/users'],
    ['PATIENT', '/doctor/schedule'],
    ['PATIENT', '/patients/p1'],
    ['DOCTOR', '/booking'],
    ['DOCTOR', '/admin'],
    ['ADMIN', '/appointments'],
    ['ADMIN', '/encounters/e1'],
  ] as const)('should refuse %s on %s', (role, path) => {
    expect(isPathAllowedForRole(role, path)).toBe(false);
  });

  it('should not mistake the public /doctors catalogue for the /doctor group', () => {
    expect(isPathAllowedForRole('PATIENT', '/doctors')).toBe(true);
    expect(isPathAllowedForRole('ADMIN', '/doctors/d1')).toBe(true);
  });
});

describe('resolvePostLoginPath', () => {
  it('should keep the requested path when the role may open it', () => {
    expect(resolvePostLoginPath('PATIENT', '/appointments')).toBe('/appointments');
  });

  it.each([
    ['DOCTOR', '/booking'],
    ['ADMIN', '/booking'],
    ['PATIENT', '/admin/users'],
  ] as const)('should send %s to its landing page instead of %s', (role, requested) => {
    expect(resolvePostLoginPath(role, requested)).toBe(ROLE_LANDING[role]);
  });

  it('should keep the requested path when the role is unknown', () => {
    expect(resolvePostLoginPath(null, '/booking')).toBe('/booking');
  });
});
