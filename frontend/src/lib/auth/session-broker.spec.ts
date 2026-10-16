/** @jest-environment node */
import { fakeAccessToken, jsonResponse, tokenEndpointBody } from './jwt-fixture';
import {
  buildSessionPayload,
  CACHED_TOKEN_MARGIN_MS,
  readCachedSession,
  resetRotationGraceForTests,
  revokeRefreshToken,
  rotateRefreshToken,
} from './session-broker';

const ENV = { AUTH_BACKEND_URL: 'http://auth.test:3000', OAUTH_CLIENT_ID: 'medcenter-web' };

describe('rotateRefreshToken', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    resetRotationGraceForTests();
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('should exchange the refresh token at the token endpoint with the registered client id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const result = await rotateRefreshToken('refresh-1', ENV);

    expect(result).toEqual({ ok: true, tokens: expect.objectContaining({ refreshToken: 'refresh-next', expiresIn: 900 }) });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://auth.test:3000/oauth/token');
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('client_id=medcenter-web');
  });

  it.each([[400], [401]])('should report an unusable token when auth-service answers %i', async (status) => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, status));

    await expect(rotateRefreshToken('refresh-1', ENV)).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([[429], [500], [503]])('should report a transient failure when auth-service answers %i', async (status) => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, status));

    await expect(rotateRefreshToken('refresh-1', ENV)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('should report a transient failure when auth-service is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(rotateRefreshToken('refresh-1', ENV)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('should report a transient failure when the body has no refresh token', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ access_token: 'a.b.c', expires_in: 900 }));

    await expect(rotateRefreshToken('refresh-1', ENV)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('should share one rotation between concurrent callers that present the same token', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(tokenEndpointBody()));

    const [first, second] = await Promise.all([rotateRefreshToken('refresh-1', ENV), rotateRefreshToken('refresh-1', ENV)]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('should not share the rotation between different tokens', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse(tokenEndpointBody())));

    await Promise.all([rotateRefreshToken('refresh-1', ENV), rotateRefreshToken('refresh-2', ENV)]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should not cache a failed rotation so the next attempt can succeed', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 503)).mockResolvedValueOnce(jsonResponse(tokenEndpointBody()));

    const failed = await rotateRefreshToken('refresh-1', ENV);
    const retried = await rotateRefreshToken('refresh-1', ENV);

    expect(failed.ok).toBe(false);
    expect(retried.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('should ask auth-service again once the grace window has passed', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-16T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse(tokenEndpointBody())));

    await rotateRefreshToken('refresh-1', ENV);
    jest.setSystemTime(new Date('2026-10-16T10:00:11Z'));
    await rotateRefreshToken('refresh-1', ENV);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('buildSessionPayload', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');

  it('should expose the role, scope and patient of the access token claims', () => {
    const accessToken = fakeAccessToken({ role: 'PATIENT', patient: '1439', scope: 'launch patient/*.read' });

    expect(buildSessionPayload({ accessToken, refreshToken: 'r', expiresIn: 900 }, NOW)).toEqual({
      accessToken,
      expiresAt: '2026-10-16T10:15:00.000Z',
      role: 'PATIENT',
      scope: 'launch patient/*.read',
      patientRef: '1439',
      fhirUser: null,
    });
  });

  it('should carry the fhirUser of a doctor and no patient', () => {
    const accessToken = fakeAccessToken({ role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/6ef5' });

    const payload = buildSessionPayload({ accessToken, refreshToken: 'r', expiresIn: 900 }, NOW);

    expect(payload).toMatchObject({ role: 'DOCTOR', patientRef: null, fhirUser: 'PractitionerRole/6ef5' });
  });

  it('should coerce an unknown role to null so the UI never trusts a made-up one', () => {
    const accessToken = fakeAccessToken({ role: 'SUPERUSER' });

    expect(buildSessionPayload({ accessToken, refreshToken: 'r', expiresIn: 900 }, NOW).role).toBeNull();
  });

  it('should tolerate an access token that is not a decodable JWT', () => {
    expect(buildSessionPayload({ accessToken: 'opaque', refreshToken: 'r', expiresIn: 900 }, NOW)).toMatchObject({
      accessToken: 'opaque',
      role: null,
      scope: null,
    });
  });
});

describe('readCachedSession', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');
  const exp = (offsetMs: number): number => Math.floor((NOW + offsetMs) / 1000);

  it('should describe a token that is valid for more than the margin', () => {
    const accessToken = fakeAccessToken({ role: 'DOCTOR', patient: undefined, fhirUser: 'PractitionerRole/6ef5', exp: exp(10 * 60_000) });

    expect(readCachedSession(accessToken, NOW)).toEqual({
      accessToken,
      expiresAt: '2026-10-16T10:10:00.000Z',
      role: 'DOCTOR',
      scope: 'launch patient/*.read patient/*.write',
      patientRef: null,
      fhirUser: 'PractitionerRole/6ef5',
    });
  });

  it('should refuse a token that expires within the margin so the client never holds a token about to die', () => {
    expect(readCachedSession(fakeAccessToken({ exp: exp(CACHED_TOKEN_MARGIN_MS) }), NOW)).toBeNull();
    expect(readCachedSession(fakeAccessToken({ exp: exp(CACHED_TOKEN_MARGIN_MS + 2_000) }), NOW)).not.toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a JWT', 'opaque'],
    ['without exp', fakeAccessToken({ exp: undefined })],
    ['with a string exp', fakeAccessToken({ exp: '9999999999' })],
    ['expired', fakeAccessToken({ exp: exp(-1000) })],
    ['without a known role', fakeAccessToken({ role: 'SUPERUSER', exp: exp(600_000) })],
  ])('should return null for a token that is %s', (_label, token) => {
    expect(readCachedSession(token, NOW)).toBeNull();
  });
});

describe('revokeRefreshToken', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send the refresh token with the owner Bearer to the revoke endpoint', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ revoked: true }));

    const revoked = await revokeRefreshToken('refresh-1', 'access-1', ENV);

    expect(revoked).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://auth.test:3000/oauth/token/revoke');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken: 'refresh-1', client_id: 'medcenter-web' });
  });

  it('should resolve false instead of throwing when auth-service is unreachable', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(revokeRefreshToken('refresh-1', 'access-1', ENV)).resolves.toBe(false);
  });
});
