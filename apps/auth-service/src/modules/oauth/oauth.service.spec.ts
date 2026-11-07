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
