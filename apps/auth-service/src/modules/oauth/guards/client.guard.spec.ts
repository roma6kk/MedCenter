import type { ExecutionContext } from '@nestjs/common';

import { TEST_REDIRECT_URI, createTestClient } from '../__tests__/test-keys';
import { OAuthError } from '../oauth-error';
import {
  ClientGuard,
  InMemoryClientRegistry,
  assertRegisteredRedirectUri,
  type ClientRegistry,
  type RegisteredClient,
} from './client.guard';

interface GuardRequest {
  readonly query: Record<string, unknown>;
  client?: RegisteredClient;
}

function createContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function activateAndCaptureError(
  guard: ClientGuard,
  context: ExecutionContext,
): Promise<OAuthError> {
  const error = await guard.canActivate(context).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(OAuthError);
  return error as OAuthError;
}

describe('InMemoryClientRegistry', () => {
  it('should return the client when the id is registered', async () => {
    const registry = new InMemoryClientRegistry([createTestClient()]);

    await expect(registry.find('medcenter-web')).resolves.toMatchObject({
      clientId: 'medcenter-web',
      isPublic: true,
    });
  });

  it('should return null when the client id is unknown', async () => {
    const registry = new InMemoryClientRegistry([createTestClient()]);

    await expect(registry.find('rogue-app')).resolves.toBeNull();
  });

  it('should return null for every id when it is constructed empty', async () => {
    const registry = new InMemoryClientRegistry();

    await expect(registry.find('medcenter-web')).resolves.toBeNull();
  });

  it('should index every client it is given when several are registered', async () => {
    const registry = new InMemoryClientRegistry([
      createTestClient(),
      createTestClient({ clientId: 'second-app' }),
    ]);

    await expect(registry.find('second-app')).resolves.toMatchObject({ clientId: 'second-app' });
  });

  describe('verifySecret', () => {
    it.each([
      ['accept any secret for a public client', { isPublic: true }, undefined, true],
      ['accept the configured secret for a confidential client', { isPublic: false, clientSecret: 'shhh-secret' }, 'shhh-secret', true],
      ['reject a wrong secret for a confidential client', { isPublic: false, clientSecret: 'shhh-secret' }, 'guessed', false],
      ['reject a secret of a different length without throwing', { isPublic: false, clientSecret: 'shhh-secret' }, 's', false],
      ['fail closed when a confidential client has no configured secret', { isPublic: false }, 'anything', false],
      ['reject an absent secret for a confidential client', { isPublic: false, clientSecret: 'shhh-secret' }, undefined, false],
    ])('should %s', (_label, overrides, secret, expected) => {
      expect(new InMemoryClientRegistry().verifySecret(createTestClient(overrides), secret)).toBe(expected);
    });
  });
});

describe('assertRegisteredRedirectUri', () => {
  it('should accept a redirect uri that is registered verbatim', () => {
    expect(() => assertRegisteredRedirectUri(createTestClient(), TEST_REDIRECT_URI)).not.toThrow();
  });

  it('should reject a redirect uri that only extends a registered one', () => {
    expect(() =>
      assertRegisteredRedirectUri(createTestClient(), `${TEST_REDIRECT_URI}.evil.example`),
    ).toThrow(OAuthError);
  });

  it('should reject a redirect uri that is a prefix of a registered one', () => {
    expect(() => assertRegisteredRedirectUri(createTestClient(), 'https://app.medcenter.by/')).toThrow(
      OAuthError,
    );
  });

  it('should report invalid_request when the redirect uri is not registered', () => {
    let thrown: unknown = null;
    try {
      assertRegisteredRedirectUri(createTestClient(), 'https://attacker.example/callback');
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OAuthError);
    expect((thrown as OAuthError).getResponse()).toMatchObject({ error: 'invalid_request' });
  });
});

describe('ClientGuard', () => {
  const registry: ClientRegistry = new InMemoryClientRegistry([
    createTestClient({ clientId: 'medcenter-web' }),
    createTestClient({ clientId: 'registered-app', redirectUris: [TEST_REDIRECT_URI] }),
  ]);

  it('should attach the resolved client when the client_id is registered', async () => {
    const guard = new ClientGuard(registry);
    const request: GuardRequest = { query: { client_id: 'medcenter-web' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.client?.clientId).toBe('medcenter-web');
  });

  it('should allow the request when redirect_uri is omitted', async () => {
    const guard = new ClientGuard(registry);
    const request: GuardRequest = { query: { client_id: 'medcenter-web' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it.each([
    ['absent', {}],
    ['unknown', { client_id: 'not-registered' }],
  ])('should answer invalid_client when the client_id is %s', async (_label, query) => {
    const error = await activateAndCaptureError(new ClientGuard(registry), createContext({ query }));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_client' });
  });

  it('should reject an unregistered redirect_uri without attaching a client', async () => {
    const guard = new ClientGuard(registry);
    const request: GuardRequest = {
      query: { client_id: 'medcenter-web', redirect_uri: 'https://attacker.example/cb' },
    };

    const error = await activateAndCaptureError(guard, createContext(request));

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_request' });
    expect(request.client).toBeUndefined();
  });

  it('should treat a repeated client_id parameter as an unknown client', async () => {
    const guard = new ClientGuard(registry);
    const request: GuardRequest = { query: { client_id: ['medcenter-web', 'medcenter-web'] } };

    const error = await activateAndCaptureError(guard, createContext(request));

    expect(error.getStatus()).toBe(401);
  });
});
