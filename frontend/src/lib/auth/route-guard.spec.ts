import { isProtectedPath, shouldRedirectToLogin, PROTECTED_PREFIXES } from './route-guard';

describe('route-guard', () => {
  describe('isProtectedPath', () => {
    it.each([
      ['/booking'],
      ['/booking/confirm'],
      ['/appointments'],
      ['/appointments/abc-123'],
      ['/history'],
      ['/prescriptions'],
      ['/profile'],
      ['/notifications'],
      ['/doctor'],
      ['/doctor/appointments'],
      ['/doctor/schedule'],
      ['/encounters/enc-1'],
      ['/patients/pat-9'],
      ['/admin'],
      ['/admin/users'],
      ['/admin/schedules'],
      ['/admin/terminology'],
      ['/admin/audit'],
    ])('should protect %s', (path) => {
      expect(isProtectedPath(path)).toBe(true);
    });

    it.each([
      ['/', 'public landing'],
      ['/doctors', 'public catalog'],
      ['/doctors/doc-1', 'public doctor card'],
      ['/login', 'login page'],
      ['/login?returnTo=/booking', 'login with query'],
      ['/register', 'registration'],
      ['/bookingx', 'prefix without segment boundary'],
      ['/booking-confirmation', 'hyphenated lookalike'],
      ['/administrator', 'admin lookalike without boundary'],
      ['/adminx/users', 'admin lookalike nested'],
      ['/doctorx', 'doctor lookalike'],
      ['/patients-history', 'hyphenated patient lookalike'],
      ['/api/auth/session', 'auth broker route'],
      ['', 'empty path'],
    ])('should not protect %s (%s)', (path) => {
      expect(isProtectedPath(path)).toBe(false);
    });

    it('should expose 10 protected prefixes', () => {
      expect(PROTECTED_PREFIXES).toHaveLength(10);
    });
  });

  describe('shouldRedirectToLogin', () => {
    it('should redirect when protected path has no session', () => {
      expect(shouldRedirectToLogin('/booking', false)).toBe(true);
      expect(shouldRedirectToLogin('/admin/users', false)).toBe(true);
    });

    it('should not redirect when session exists', () => {
      expect(shouldRedirectToLogin('/booking', true)).toBe(false);
      expect(shouldRedirectToLogin('/admin', true)).toBe(false);
    });

    it('should not redirect public paths without session', () => {
      expect(shouldRedirectToLogin('/', false)).toBe(false);
      expect(shouldRedirectToLogin('/doctors', false)).toBe(false);
      expect(shouldRedirectToLogin('/login', false)).toBe(false);
    });

    it('should not redirect lookalike paths without session', () => {
      expect(shouldRedirectToLogin('/bookingx', false)).toBe(false);
      expect(shouldRedirectToLogin('/administrator', false)).toBe(false);
    });
  });
});
