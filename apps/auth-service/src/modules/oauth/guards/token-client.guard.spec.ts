import type { ExecutionContext } from '@nestjs/common';

import { createTestClient } from '../__tests__/test-keys';
import { OAuthError } from '../oauth-error';
import { InMemoryClientRegistry, type ClientRegistry } from './client.guard';
import { TokenClientGuard, type RequestWithClientBody } from './token-client.guard';

function createContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function activateAndCaptureError(
  guard: TokenClientGuard,
  context: ExecutionContext,
): Promise<OAuthError> {
  const error = await guard.canActivate(context).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(OAuthError);
  return error as OAuthError;
}

const registry: ClientRegistry = new InMemoryClientRegistry([
  createTestClient({ clientId: 'medcenter-web', isPublic: true }),
  createTestClient({
    clientId: 'medcenter-server',
    isPublic: false,
    clientSecret: 'server-secret',
  }),
]);

describe('TokenClientGuard', () => {
  const guard = new TokenClientGuard(registry);

  it('should allow a registered public client without a secret', async () => {
    const request: RequestWithClientBody = { body: { client_id: 'medcenter-web' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.client?.clientId).toBe('medcenter-web');
  });

  it('should allow a confidential client presenting the configured secret', async () => {
    const request: RequestWithClientBody = {
      body: { client_id: 'medcenter-server', client_secret: 'server-secret' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('should answer invalid_client when client_id is absent from the body', async () => {
    const error = await activateAndCaptureError(guard, createContext({ body: {} }));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_client' });
  });

  it('should answer invalid_client when the body is missing entirely', async () => {
    const error = await activateAndCaptureError(guard, createContext({}));

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_client' });
  });

  it('should answer invalid_client when client_id is unknown', async () => {
    const error = await activateAndCaptureError(
      guard,
      createContext({ body: { client_id: 'rogue-app' } }),
    );

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({ error: 'invalid_client' });
  });

  it('should answer invalid_client when a confidential client omits the secret', async () => {
    const error = await activateAndCaptureError(
      guard,
      createContext({ body: { client_id: 'medcenter-server' } }),
    );

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toMatchObject({
      error: 'invalid_client',
      error_description: 'Client authentication failed',
    });
  });

  it('should answer invalid_client when a confidential client presents a wrong secret', async () => {
    const error = await activateAndCaptureError(
      guard,
      createContext({ body: { client_id: 'medcenter-server', client_secret: 'guessed' } }),
    );

    expect(error.getStatus()).toBe(401);
  });

  it('should ignore a non-string client_secret for a public client', async () => {
    const request: RequestWithClientBody = {
      body: { client_id: 'medcenter-web', client_secret: ['a', 'b'] },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });
});
