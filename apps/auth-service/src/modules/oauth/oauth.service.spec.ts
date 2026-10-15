import { Role } from '@medcenter/contracts';

import {
  captureOAuthError,
  createOAuthHarness as createHarness,
  decodeClaims,
  readRedirectParam as cookieFromRedirect,
} from './__tests__/oauth-harness';
import { TEST_REDIRECT_URI, createTestClient } from './__tests__/test-keys';

describe('OAuthService', () => {
  it('should return a redirect carrying the code and state when authorize succeeds', async () => {
    const { service } = createHarness();
    const { codeChallenge } = createHarness().pkce.generate();

    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'patient/*.read',
      state: 'state-1',
      codeChallenge,
      principal: { userId: 'u1', role: 'PATIENT', patientRef: 'Patient/1' },
    });

    expect(redirect.startsWith(TEST_REDIRECT_URI)).toBe(true);
    expect(cookieFromRedirect(redirect, 'state')).toBe('state-1');
    expect(cookieFromRedirect(redirect, 'code').length).toBeGreaterThan(0);
  });

  it('should drop scopes the client is not registered for when authorizing', async () => {
    // M5: the previous version of this test exchanged with a bogus verifier
    // and asserted only the PKCE failure — it proved nothing about narrowing.
    // This one goes through the full authorize → exchange flow and asserts the
    // issued scope is the narrowed one.
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();

    const redirect = await service.authorize({
      client: createTestClient({ scopes: ['launch'] }),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch patient/*.write',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1', role: 'PATIENT' },
    });
    const tokens = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    expect(tokens.scope).toBe('launch');
  });

  it('should answer invalid_scope when no requested scope is granted to the client', async () => {
    // M5: a token with an empty scope must never be minted.
    const { service, pkce } = createHarness();
    const { codeChallenge } = pkce.generate();

    const error = await captureOAuthError(
      service.authorize({
        client: createTestClient({ scopes: ['launch'] }),
        redirectUri: TEST_REDIRECT_URI,
        scope: 'patient/*.write',
        state: 's',
        codeChallenge,
        principal: { userId: 'u1', role: 'PATIENT' },
      }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_scope' });
  });

  it('should grant the full client scope when the authorize request asks for none', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();

    const redirect = await service.authorize({
      client: createTestClient({ scopes: ['launch'] }),
      redirectUri: TEST_REDIRECT_URI,
      scope: '',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1', role: 'PATIENT' },
    });
    const tokens = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    expect(tokens.scope).toBe('launch');
  });

  it('should issue a token pair when the code and PKCE verifier are valid', async () => {
    const { service, pkce, identities } = createHarness();
    identities.set('u1', { role: Role.PATIENT, patientId: '1' });
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'patient/*.read',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1', role: 'PATIENT', patientRef: 'Patient/1' },
    });

    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
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
    // The access token's session id is the paired refresh token's `jti`, which is
    // what lets the guard layer treat a revocation of that refresh token as a
    // revocation of the pair (API error catalogue `TOKEN_REVOKED`).
    expect(claims['sid']).toBe(response.refresh_token);
  });

  it('should mark the whole session as revoked when the owner revokes the refresh token', async () => {
    const { service, tokens, pkce } = createHarness();
    const { codeChallenge, codeVerifier } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'patient/*.read',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });
    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    await expect(
      service.revoke({ refreshToken: response.refresh_token, userId: 'u1' }),
    ).resolves.toBe(true);

    // `response.refresh_token` is the `sid` of `response.access_token`, so this is
    // exactly the lookup `JwtAuthGuard` performs for that access token.
    await expect(tokens.isRevoked(response.refresh_token)).resolves.toBe(true);
  });

  it('should reject the exchange when the PKCE verifier does not match', async () => {
    const { service, pkce } = createHarness();
    const { codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });

    const error = await captureOAuthError(
      service.exchangeCode({
        code: cookieFromRedirect(redirect, 'code'),
        clientId: 'medcenter-web',
        codeVerifier: 'wrong-verifier',
      }),
    );

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should reject a replayed authorization code', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });
    const code = cookieFromRedirect(redirect, 'code');

    await service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier });
    const error = await captureOAuthError(
      service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should reject the exchange when client_id does not own the code', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });

    const error = await captureOAuthError(
      service.exchangeCode({
        code: cookieFromRedirect(redirect, 'code'),
        clientId: 'someone-else',
        codeVerifier,
      }),
    );

    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should rotate the refresh token so the presented one is never reusable', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });
    const first = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    const rotated = await service.refresh({
      refreshToken: first.refresh_token,
      clientId: 'medcenter-web',
    });

    expect(rotated.refresh_token).not.toBe(first.refresh_token);
    const error = await captureOAuthError(
      service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' }),
    );
    // RFC 6749 §5.2 / API 2.1.3: an already-rotated token is a plain 400 invalid_grant.
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
    await expect(
      service.refresh({ refreshToken: rotated.refresh_token, clientId: 'medcenter-web' }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should deny a refresh token after it is revoked', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'u1' },
    });
    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    await service.revoke({ refreshToken: response.refresh_token, userId: 'u1' });

    const error = await captureOAuthError(
      service.refresh({ refreshToken: response.refresh_token, clientId: 'medcenter-web' }),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_grant' });
  });

  it('should revoke a refresh token when the authenticated user owns it', async () => {
    const { service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'owner-1' },
    });
    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    await expect(
      service.revoke({ refreshToken: response.refresh_token, userId: 'owner-1' }),
    ).resolves.toBe(true);
  });

  it('should not revoke a refresh token owned by a different user', async () => {
    const { tokens, service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'owner-1' },
    });
    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    await expect(
      service.revoke({ refreshToken: response.refresh_token, userId: 'intruder-2' }),
    ).resolves.toBe(false);
    // The token is untouched: it is neither denied nor removed.
    await expect(tokens.isDenied(response.refresh_token)).resolves.toBe(false);
    await expect(tokens.find(response.refresh_token)).resolves.not.toBeNull();
  });

  it('should not revoke a refresh token owned by a different client', async () => {
    const { tokens, service, pkce } = createHarness();
    const { codeVerifier, codeChallenge } = pkce.generate();
    const redirect = await service.authorize({
      client: createTestClient(),
      redirectUri: TEST_REDIRECT_URI,
      scope: 'launch',
      state: 's',
      codeChallenge,
      principal: { userId: 'owner-1' },
    });
    const response = await service.exchangeCode({
      code: cookieFromRedirect(redirect, 'code'),
      clientId: 'medcenter-web',
      codeVerifier,
    });

    await expect(
      service.revoke({
        refreshToken: response.refresh_token,
        userId: 'owner-1',
        clientId: 'someone-else',
      }),
    ).resolves.toBe(false);
    await expect(tokens.isDenied(response.refresh_token)).resolves.toBe(false);
  });

  it('should treat an unknown refresh token as a no-op on revoke', async () => {
    const { service } = createHarness();

    await expect(
      service.revoke({ refreshToken: 'never-issued', userId: 'u1' }),
    ).resolves.toBe(false);
  });
});
