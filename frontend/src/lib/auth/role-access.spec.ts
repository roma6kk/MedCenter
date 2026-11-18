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

  it('should not send a visitor to login when auth-service did not answer, so nothing is known about them', () => {
    expect(resolveRoleAccess('PATIENT', { hydrated: true, role: null, unavailable: true })).toBe('unavailable');
  });

  it('should still decide by the role when one is known, even if the last exchange got no answer', () => {
    expect(resolveRoleAccess('PATIENT', { hydrated: true, role: 'PATIENT', unavailable: true })).toBe('allow');
    expect(resolveRoleAccess('PATIENT', { hydrated: true, role: 'DOCTOR', unavailable: true })).toBe('forbidden');
  });
});
