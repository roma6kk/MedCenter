import { Role } from '@medcenter/contracts';

import {
  captureOAuthError,
  createOAuthHarness as createHarness,
  decodeClaims,
  readRedirectParam as cookieFromRedirect,
  type OAuthHarness,
} from './__tests__/oauth-harness';
import { TEST_REDIRECT_URI, createTestClient } from './__tests__/test-keys';

type AuthorizeParams = Parameters<OAuthHarness['service']['authorize']>[0];

interface AuthorizeOptions {
  readonly scope?: string;
  readonly principal?: AuthorizeParams['principal'];
  readonly client?: Parameters<typeof createTestClient>[0];
}

async function authorize(
  { service, pkce }: OAuthHarness,
  { scope = 'launch', principal = { userId: 'u1' }, client }: AuthorizeOptions = {},
): Promise<{ readonly redirect: string; readonly code: string; readonly codeVerifier: string }> {
  const { codeVerifier, codeChallenge } = pkce.generate();
  const redirect = await service.authorize({
    client: createTestClient(client),
    redirectUri: TEST_REDIRECT_URI,
    scope,
    state: 's',
    codeChallenge,
    principal,
  });

  return { redirect, code: cookieFromRedirect(redirect, 'code'), codeVerifier };
}

async function signIn(harness: OAuthHarness, options?: AuthorizeOptions): ReturnType<OAuthHarness['service']['exchangeCode']> {
  const { code, codeVerifier } = await authorize(harness, options);

  return harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier });
}

describe('OAuthService', () => {
  it('should return a redirect carrying the code and state when authorize succeeds', async () => {
    const harness = createHarness();

    const { redirect, code } = await authorize(harness, {
      scope: 'patient/*.read',
      principal: { userId: 'u1', role: 'PATIENT', patientRef: 'Patient/1' },
    });

    expect(redirect.startsWith(TEST_REDIRECT_URI)).toBe(true);
    expect(cookieFromRedirect(redirect, 'state')).toBe('s');
    expect(code.length).toBeGreaterThan(0);
  });

  it('should drop scopes the client is not registered for when authorizing', async () => {
    const tokens = await signIn(createHarness(), {
      client: { scopes: ['launch'] },
      scope: 'launch patient/*.write',
      principal: { userId: 'u1', role: 'PATIENT' },
    });

    expect(tokens.scope).toBe('launch');
  });

  it('should answer invalid_scope when no requested scope is granted to the client', async () => {
    const harness = createHarness();

    const error = await captureOAuthError(
      authorize(harness, { client: { scopes: ['launch'] }, scope: 'patient/*.write', principal: { userId: 'u1', role: 'PATIENT' } }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_scope' });
  });

  it('should grant the full client scope when the authorize request asks for none', async () => {
    const tokens = await signIn(createHarness(), {
      client: { scopes: ['launch'] },
      scope: '',
      principal: { userId: 'u1', role: 'PATIENT' },
    });

    expect(tokens.scope).toBe('launch');
  });

  it('should issue a token pair when the code and PKCE verifier are valid', async () => {
    const harness = createHarness();
    harness.identities.set('u1', { role: Role.PATIENT, patientId: '1' });

    const response = await signIn(harness, {
      scope: 'patient/*.read',
      principal: { userId: 'u1', role: 'PATIENT', patientRef: 'Patient/1' },
    });

    expect(response.token_type).toBe('Bearer');
    expect(response.expires_in).toBe(900);
    expect(response.scope).toBe('patient/*.read');
    expect(response.patient).toBe('1');
    expect(response.refresh_token.length).toBeGreaterThan(0);
    const claims = decodeClaims(response.access_token);
    expect(claims['role']).toBe('PATIENT');
    expect(claims['patient']).toBe('1');
    expect(claims['fhirUser']).toBe('Patient/1');
    expect(claims['sid']).toBe(response.refresh_token);
  });

  it('should mark the whole session as revoked when the owner revokes the refresh token', async () => {
    const harness = createHarness();
    const response = await signIn(harness, { scope: 'patient/*.read' });

    await expect(
      harness.service.revoke({ refreshToken: response.refresh_token, userId: 'u1' }),
    ).resolves.toBe(true);

    await expect(harness.tokens.isRevoked(response.refresh_token)).resolves.toBe(true);
  });

  it('should reject the exchange when the PKCE verifier does not match', async () => {
    const harness = createHarness();
    const { code } = await authorize(harness);

    const error = await captureOAuthError(
      harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier: 'wrong-verifier' }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should reject a replayed authorization code', async () => {
    const harness = createHarness();
    const { service } = harness;
    const { code, codeVerifier } = await authorize(harness);

    await service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier });
    const error = await captureOAuthError(
      service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should reject the exchange when client_id does not own the code', async () => {
    const harness = createHarness();
    const { code, codeVerifier } = await authorize(harness);

    const error = await captureOAuthError(
      harness.service.exchangeCode({ code, clientId: 'someone-else', codeVerifier }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should rotate the refresh token so the presented one is never reusable', async () => {
    const harness = createHarness();
    const { service } = harness;
    const first = await signIn(harness);

    const rotated = await service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' });

    expect(rotated.refresh_token).not.toBe(first.refresh_token);
    const error = await captureOAuthError(
      service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' }),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
    await expect(
      service.refresh({ refreshToken: rotated.refresh_token, clientId: 'medcenter-web' }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should deny a refresh token after it is revoked', async () => {
    const harness = createHarness();
    const { service } = harness;
    const response = await signIn(harness);

    await service.revoke({ refreshToken: response.refresh_token, userId: 'u1' });

    const error = await captureOAuthError(
      service.refresh({ refreshToken: response.refresh_token, clientId: 'medcenter-web' }),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should revoke a refresh token when the authenticated user owns it', async () => {
    const harness = createHarness();
    const response = await signIn(harness, { principal: { userId: 'owner-1' } });

    await expect(
      harness.service.revoke({ refreshToken: response.refresh_token, userId: 'owner-1' }),
    ).resolves.toBe(true);
  });

  it('should not revoke a refresh token owned by a different user', async () => {
    const harness = createHarness();
    const response = await signIn(harness, { principal: { userId: 'owner-1' } });

    await expect(
      harness.service.revoke({ refreshToken: response.refresh_token, userId: 'intruder-2' }),
    ).resolves.toBe(false);
    await expect(harness.tokens.isDenied(response.refresh_token)).resolves.toBe(false);
    await expect(harness.tokens.find(response.refresh_token)).resolves.not.toBeNull();
  });

  it('should not revoke a refresh token owned by a different client', async () => {
    const harness = createHarness();
    const response = await signIn(harness, { principal: { userId: 'owner-1' } });

    await expect(
      harness.service.revoke({ refreshToken: response.refresh_token, userId: 'owner-1', clientId: 'someone-else' }),
    ).resolves.toBe(false);
    await expect(harness.tokens.isDenied(response.refresh_token)).resolves.toBe(false);
  });

  it('should treat an unknown refresh token as a no-op on revoke', async () => {
    const { service } = createHarness();

    await expect(service.revoke({ refreshToken: 'never-issued', userId: 'u1' })).resolves.toBe(false);
  });
});

describe('OAuthService idle session timeout', () => {
  const IDLE_MS = 15 * 60_000;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function refresh(harness: OAuthHarness, token: string): ReturnType<OAuthHarness['service']['refresh']> {
    return harness.service.refresh({ refreshToken: token, clientId: 'medcenter-web' });
  }

  it('should refuse a refresh once the session was idle for longer than the limit', async () => {
    const harness = createHarness(IDLE_MS);
    const first = await signIn(harness);

    jest.setSystemTime(Date.now() + IDLE_MS + 1_000);

    const error = await captureOAuthError(refresh(harness, first.refresh_token));
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
    await expect(harness.tokens.isRevoked(first.refresh_token)).resolves.toBe(true);
    expect(harness.recordAuthEvent).toHaveBeenCalledWith({ kind: 'session-idle', userId: 'u1' });
  });

  it('should not count a refresh as activity, so polling cannot keep an abandoned session alive', async () => {
    const harness = createHarness(IDLE_MS);
    let current = await signIn(harness);

    for (let minute = 0; minute < 10; minute += 1) {
      jest.setSystemTime(Date.now() + 2 * 60_000);
      current = await refresh(harness, current.refresh_token).catch(() => current);
    }

    await expect(refresh(harness, current.refresh_token)).rejects.toBeDefined();
  });

  it('should keep the session alive while activity is recorded', async () => {
    const harness = createHarness(IDLE_MS);
    let current = await signIn(harness);

    for (let step = 0; step < 6; step += 1) {
      jest.setSystemTime(Date.now() + 10 * 60_000);
      await expect(harness.service.recordActivity(current.refresh_token, 'u1')).resolves.toBe(true);
      current = await refresh(harness, current.refresh_token);
    }

    await expect(refresh(harness, current.refresh_token)).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should record activity of a tab holding a rotated session id against the live refresh token', async () => {
    const harness = createHarness(IDLE_MS);
    const first = await signIn(harness);
    const sid = decodeClaims(first.access_token)['sid'] as string;
    jest.setSystemTime(Date.now() + 5 * 60_000);
    const rotated = await refresh(harness, first.refresh_token);

    expect(decodeClaims(rotated.access_token)['sid']).toBe(sid);
    jest.setSystemTime(Date.now() + 5 * 60_000);
    await expect(harness.service.recordActivity(sid, 'u1')).resolves.toBe(true);

    jest.setSystemTime(Date.now() + 10 * 60_000);
    await expect(refresh(harness, rotated.refresh_token)).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should revoke the whole session through its stable id after rotations', async () => {
    const harness = createHarness(IDLE_MS);
    const first = await signIn(harness);
    const sid = decodeClaims(first.access_token)['sid'] as string;
    const rotated = await refresh(harness, first.refresh_token);

    await harness.tokens.revoke(sid);

    await expect(harness.tokens.isRevoked(sid)).resolves.toBe(true);
    await expect(harness.tokens.find(rotated.refresh_token)).resolves.toBeNull();
  });

  it('should treat a legacy token without a session id as its own session', async () => {
    const harness = createHarness(IDLE_MS);
    const legacy = await harness.tokens.issue({ userId: 'u1', clientId: 'medcenter-web', scope: 'launch', kind: 'refresh', ttlSeconds: 600 });
    const withoutSession = { ...legacy } as { -readonly [K in keyof typeof legacy]?: (typeof legacy)[K] };
    delete withoutSession.sessionId;
    await harness.store.save(withoutSession as typeof legacy);

    await expect(harness.service.recordActivity(legacy.jti, 'u1')).resolves.toBe(true);
    const rotated = await refresh(harness, legacy.jti);

    expect(decodeClaims(rotated.access_token)['sid']).toBe(legacy.jti);
    await expect(harness.service.recordActivity(legacy.jti, 'u1')).resolves.toBe(true);
  });

  it('should refuse to record activity for an idle, unknown or foreign session', async () => {
    const harness = createHarness(IDLE_MS);
    const first = await signIn(harness);

    await expect(harness.service.recordActivity('never-issued', 'u1')).resolves.toBe(false);
    await expect(harness.service.recordActivity(first.refresh_token, 'intruder')).resolves.toBe(false);
    jest.setSystemTime(Date.now() + IDLE_MS + 1_000);
    await expect(harness.service.recordActivity(first.refresh_token, 'u1')).resolves.toBe(false);
  });
});

describe('OAuthService authentication journal', () => {
  it('should journal a logout when the refresh token is revoked by its owner', async () => {
    const harness = createHarness();
    const tokens = await signIn(harness);

    await harness.service.revoke({ refreshToken: tokens.refresh_token, userId: 'u1' });

    expect(harness.recordAuthEvent).toHaveBeenCalledWith({ kind: 'logout', userId: 'u1' });
  });

  it('should journal a session-idle when the client ended the session for inactivity', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-14T10:00:00Z') });
    const harness = createHarness(15 * 60_000);
    const tokens = await signIn(harness);
    jest.setSystemTime(Date.now() + 15 * 60_000 - 30_000);

    await harness.service.revoke({ refreshToken: tokens.refresh_token, userId: 'u1', reason: 'idle' });
    jest.useRealTimers();

    expect(harness.recordAuthEvent).toHaveBeenCalledWith({ kind: 'session-idle', userId: 'u1' });
  });

  it('should journal a plain logout when an idle reason is claimed for a recently active session', async () => {
    const harness = createHarness(15 * 60_000);
    const tokens = await signIn(harness);

    await harness.service.revoke({ refreshToken: tokens.refresh_token, userId: 'u1', reason: 'idle' });

    expect(harness.recordAuthEvent).toHaveBeenCalledWith({ kind: 'logout', userId: 'u1' });
  });

  it('should not journal a logout when the token belongs to someone else', async () => {
    const harness = createHarness();
    const tokens = await signIn(harness);

    await harness.service.revoke({ refreshToken: tokens.refresh_token, userId: 'other' });

    expect(harness.recordAuthEvent).not.toHaveBeenCalled();
  });
});
