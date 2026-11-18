import { createOAuthHarness as createHarness, readRedirectParam } from './__tests__/oauth-harness';
import { TEST_REDIRECT_URI, createTestClient } from './__tests__/test-keys';

async function login(harness: ReturnType<typeof createHarness>): Promise<{ code: string; codeVerifier: string }> {
  const { codeVerifier, codeChallenge } = harness.pkce.generate();
  const redirect = await harness.service.authorize({
    client: createTestClient(),
    redirectUri: TEST_REDIRECT_URI,
    scope: 'launch',
    state: 's',
    codeChallenge,
    principal: { userId: 'u1' },
  });
  return { code: readRedirectParam(redirect, 'code'), codeVerifier };
}

describe('OAuthService when the identity lookup fails', () => {
  it('should keep the refresh token usable for a retry after a database failure', async () => {
    const harness = createHarness();
    const { code, codeVerifier } = await login(harness);
    const first = await harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier });
    jest.spyOn(harness.identities, 'resolve').mockRejectedValueOnce(new Error('connection terminated'));

    await expect(
      harness.service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' }),
    ).rejects.toThrow('connection terminated');

    await expect(
      harness.service.refresh({ refreshToken: first.refresh_token, clientId: 'medcenter-web' }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should keep the authorization code usable for a retry after a database failure', async () => {
    const harness = createHarness();
    const { code, codeVerifier } = await login(harness);
    jest.spyOn(harness.identities, 'resolve').mockRejectedValueOnce(new Error('connection terminated'));

    await expect(
      harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier }),
    ).rejects.toThrow('connection terminated');

    await expect(
      harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier }),
    ).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('should let only one of two concurrent refreshes of a token win', async () => {
    const harness = createHarness();
    const { code, codeVerifier } = await login(harness);
    const first = await harness.service.exchangeCode({ code, clientId: 'medcenter-web', codeVerifier });
    const params = { refreshToken: first.refresh_token, clientId: 'medcenter-web' };

    const results = await Promise.allSettled([harness.service.refresh(params), harness.service.refresh(params)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
});
