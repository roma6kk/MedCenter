import { PROTECTED_ROUTES, roleProbesFor, type ProtectedRoute } from './access-matrix';

const entry = (roles: ProtectedRoute['roles']): ProtectedRoute => ({ method: 'GET', path: '/api/v1/x', roles });

describe('roleProbesFor', () => {
  it('should probe DOCTOR on an admin route as RoleGuard alone, since a doctor holds the same user scopes', () => {
    expect(roleProbesFor(entry(['ADMIN']))).toEqual([
      { role: 'PATIENT', expected: 'FORBIDDEN_ROLE_OR_SCOPE' },
      { role: 'DOCTOR', expected: 'FORBIDDEN_ROLE' },
    ]);
  });

  it('should probe ADMIN on a doctor route as RoleGuard alone', () => {
    expect(roleProbesFor(entry(['DOCTOR']))).toEqual([
      { role: 'PATIENT', expected: 'FORBIDDEN_ROLE_OR_SCOPE' },
      { role: 'ADMIN', expected: 'FORBIDDEN_ROLE' },
    ]);
  });

  it('should probe only PATIENT on a staff route, and not as RoleGuard alone, since it lacks the user scopes', () => {
    expect(roleProbesFor(entry(['DOCTOR', 'ADMIN']))).toEqual([{ role: 'PATIENT', expected: 'FORBIDDEN_ROLE_OR_SCOPE' }]);
  });

  it('should probe DOCTOR and ADMIN on a patient route without claiming RoleGuard alone answers', () => {
    expect(roleProbesFor(entry(['PATIENT']))).toEqual([
      { role: 'DOCTOR', expected: 'FORBIDDEN_ROLE_OR_SCOPE' },
      { role: 'ADMIN', expected: 'FORBIDDEN_ROLE_OR_SCOPE' },
    ]);
  });

  it('should probe DOCTOR as RoleGuard alone on a route open to PATIENT and ADMIN', () => {
    expect(roleProbesFor(entry(['PATIENT', 'ADMIN']))).toEqual([{ role: 'DOCTOR', expected: 'FORBIDDEN_ROLE' }]);
  });

  it('should have no probe for a route every role may call', () => {
    expect(roleProbesFor(entry('any'))).toEqual([]);
  });
});

describe('the real access matrix', () => {
  it('should probe DOCTOR on every admin-only route and ADMIN on every doctor-only route', () => {
    const missing = PROTECTED_ROUTES.filter((route) => Array.isArray(route.roles) && route.roles.length === 1)
      .filter((route) => {
        const other = route.roles[0] === 'ADMIN' ? 'DOCTOR' : route.roles[0] === 'DOCTOR' ? 'ADMIN' : undefined;
        return other !== undefined && !roleProbesFor(route).some((probe) => probe.role === other && probe.expected === 'FORBIDDEN_ROLE');
      })
      .map((route) => `${route.method} ${route.path}`);

    expect(missing).toEqual([]);
  });

  it('should give the patient only the two own-consent routes (3.4, 3.6) and the staff the five patient-consent routes (3.7-3.11)', () => {
    const rolesOf = (method: string, path: string): ProtectedRoute['roles'] | undefined =>
      PROTECTED_ROUTES.find((route) => route.method === method && route.path === path)?.roles;

    expect(rolesOf('GET', '/api/v1/me/consent')).toEqual(['PATIENT']);
    expect(rolesOf('POST', '/api/v1/me/consent/revoke')).toEqual(['PATIENT']);
    for (const [method, path] of [
      ['GET', '/api/v1/patients/1/consent'],
      ['POST', '/api/v1/patients/1/consent'],
      ['POST', '/api/v1/patients/1/consent/revoke'],
      ['POST', '/api/v1/patients/1/consent/scan'],
      ['GET', '/api/v1/patients/1/consent/scan/1'],
    ] as const) {
      expect(rolesOf(method, path)).toEqual(['DOCTOR', 'ADMIN']);
    }
  });
});
