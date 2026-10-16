/** @jest-environment node */
import { NextResponse } from 'next/server';
import { clearPkceCookie, clearSessionCookies, setPkceCookie, setSessionCookies } from './session-cookies';

const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 };

function cookieNamed(response: NextResponse, name: string, predicate: (header: string) => boolean = () => true): string {
  return response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`) && predicate(header)) ?? '';
}

describe('setSessionCookies', () => {
  it('should store the refresh token for 14 days on the broker path, httpOnly', () => {
    const response = NextResponse.json({});

    setSessionCookies(response, TOKENS, false);

    const header = cookieNamed(response, 'mc_rt', (value) => value.startsWith('mc_rt=refresh-1'));
    expect(header).toMatch(/Max-Age=1209600/);
    expect(header).toMatch(/Path=\/api\/auth/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
  });

  it('should store the access token only as long as it is valid, on the broker path', () => {
    const response = NextResponse.json({});

    setSessionCookies(response, { ...TOKENS, expiresIn: 600 }, false);

    const header = cookieNamed(response, 'mc_at');
    expect(header).toContain('mc_at=access-1');
    expect(header).toMatch(/Max-Age=600/);
    expect(header).toMatch(/Path=\/api\/auth/);
  });

  it('should keep the marker the edge middleware reads on the root path', () => {
    const response = NextResponse.json({});

    setSessionCookies(response, TOKENS, false);

    expect(cookieNamed(response, 'mc_session')).toMatch(/Path=\/(;|$)/);
  });

  it('should drop a legacy refresh cookie set on / by an earlier release so it cannot shadow the new one', () => {
    const response = NextResponse.json({});

    setSessionCookies(response, TOKENS, false);

    const legacy = cookieNamed(response, 'mc_rt', (value) => value.startsWith('mc_rt=;'));
    expect(legacy).toMatch(/Path=\/(;|$)/);
    expect(legacy).toMatch(/Max-Age=0|1970/);
  });

  it('should add Secure to every cookie only for an https origin', () => {
    const insecure = NextResponse.json({});
    const secure = NextResponse.json({});

    setSessionCookies(insecure, TOKENS, false);
    setSessionCookies(secure, TOKENS, true);

    expect(insecure.headers.getSetCookie().filter((header) => /Secure/i.test(header))).toEqual([]);
    ['mc_at', 'mc_session'].forEach((name) => expect(cookieNamed(secure, name)).toMatch(/Secure/i));
    expect(cookieNamed(secure, 'mc_rt', (value) => value.startsWith('mc_rt=refresh-1'))).toMatch(/Secure/i);
  });
});

describe('clearSessionCookies', () => {
  it('should expire the refresh and access cookies on both paths and the marker', () => {
    const response = NextResponse.json({});

    clearSessionCookies(response);

    const expired = response.headers.getSetCookie().map((header) => ({ name: header.split('=')[0], path: /Path=([^;]+)/.exec(header)?.[1] }));
    expect(expired).toEqual(
      expect.arrayContaining([
        { name: 'mc_rt', path: '/api/auth' },
        { name: 'mc_rt', path: '/' },
        { name: 'mc_at', path: '/api/auth' },
        { name: 'mc_at', path: '/' },
        { name: 'mc_session', path: '/' },
      ]),
    );
  });
});

describe('PKCE cookie', () => {
  it('should live ten minutes and be httpOnly', () => {
    const response = NextResponse.json({});

    setPkceCookie(response, '{"verifier":"v","state":"s"}', false);

    expect(cookieNamed(response, 'mc_pkce')).toMatch(/Max-Age=600/);
    expect(cookieNamed(response, 'mc_pkce')).toMatch(/HttpOnly/i);
  });

  it('should be expired when cleared', () => {
    const response = NextResponse.json({});

    clearPkceCookie(response);

    expect(cookieNamed(response, 'mc_pkce')).toMatch(/Max-Age=0|1970/);
  });
});
