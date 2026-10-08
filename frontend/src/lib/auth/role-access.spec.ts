import { resolveRoleAccess } from './role-access';

describe('resolveRoleAccess', () => {
  it('should wait until the session has hydrated', () => {
    expect(resolveRoleAccess('DOCTOR', { hydrated: false, role: null })).toBe('wait');
  });

  it('should allow the matching role', () => {
    expect(resolveRoleAccess('ADMIN', { hydrated: true, role: 'ADMIN' })).toBe('allow');
  });

  it('should send a wrong role to /403', () => {
    expect(resolveRoleAccess('ADMIN', { hydrated: true, role: 'PATIENT' })).toBe('forbidden');
  });

  it('should send an anonymous hydrated session to login', () => {
    expect(resolveRoleAccess('PATIENT', { hydrated: true, role: null })).toBe('login');
  });
});
