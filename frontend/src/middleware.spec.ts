/** @jest-environment node */
import { NextRequest } from 'next/server';
import { config, middleware } from './middleware';

function request(path: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = cookie === undefined ? {} : { cookie };
  return new NextRequest(`http://0.0.0.0:3000${path}`, { headers });
}

describe('middleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['APP_PUBLIC_URL'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should redirect a protected path without a session to the login page on the public origin', () => {
    const response = middleware(request('/admin/users'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?returnTo=%2Fadmin%2Fusers');
  });

  it('should keep the query string in returnTo', () => {
    const response = middleware(request('/doctor/appointments?from=2026-10-16'));

    expect(response.headers.get('location')).toBe('http://localhost:3000/login?returnTo=%2Fdoctor%2Fappointments%3Ffrom%3D2026-10-16');
  });

  it('should use the configured APP_PUBLIC_URL for the redirect', () => {
    process.env['APP_PUBLIC_URL'] = 'https://med.example.by';

    expect(middleware(request('/booking')).headers.get('location')).toBe('https://med.example.by/login?returnTo=%2Fbooking');
  });

  it('should let a protected path through when the session marker cookie is present', () => {
    const response = middleware(request('/appointments', 'mc_session=1'));

    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([['/'], ['/doctors'], ['/doctors/d1'], ['/login'], ['/register'], ['/api/v1/doctors']])('should not guard the public path %s', (path) => {
    expect(middleware(request(path)).headers.get('x-middleware-next')).toBe('1');
  });

  it('should not run for the token broker, static assets or the favicon', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test('/api/auth/session')).toBe(false);
    expect(matcher.test('/_next/static/chunk.js')).toBe(false);
    expect(matcher.test('/favicon.ico')).toBe(false);
    expect(matcher.test('/admin')).toBe(true);
  });
});
