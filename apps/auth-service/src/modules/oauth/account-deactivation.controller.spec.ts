import { createUsersHarness } from '../users/__tests__/users-harness';
import { seedPatient } from '../users/__tests__/users-fixtures';
import type { AuthenticatedRequest } from '../users/request-actor';
import { AccountDeactivationController } from './account-deactivation.controller';
import { InMemoryTokenDenylist, InMemoryTokenStore, TokenService } from './token.service';

const PASSWORD = 'Str0ng!Pass';

function requestOf(userId: string, sid?: string): AuthenticatedRequest {
  return {
    requestId: 'req-1',
    user: { sub: userId, scope: 'patient/*.rs', role: 'PATIENT', jti: 'jti-1', ...(sid !== undefined ? { sid } : {}) },
  } as unknown as AuthenticatedRequest;
}

async function setup(): Promise<{
  readonly controller: AccountDeactivationController;
  readonly tokens: TokenService;
  readonly userId: string;
  readonly harness: ReturnType<typeof createUsersHarness>;
}> {
  const harness = createUsersHarness();
  const tokens = new TokenService(new InMemoryTokenStore(), new InMemoryTokenDenylist());
  return { controller: new AccountDeactivationController(harness.users, tokens), tokens, harness, userId: await seedPatient(harness) };
}

describe('AccountDeactivationController', () => {
  it('should deactivate the account and revoke the session of the caller', async () => {
    const { controller, tokens, harness, userId } = await setup();
    const refresh = await tokens.issue({ userId, clientId: 'web', scope: 's', kind: 'refresh', ttlSeconds: 60 });

    await controller.deactivate({ password: PASSWORD }, requestOf(userId, refresh.jti));

    expect((await harness.store.findById(userId))?.isActive).toBe(false);
    expect(await tokens.find(refresh.jti)).toBeNull();
    expect(await tokens.isRevoked(refresh.jti)).toBe(true);
  });

  it('should keep the session when the password is wrong', async () => {
    const { controller, tokens, userId } = await setup();
    const refresh = await tokens.issue({ userId, clientId: 'web', scope: 's', kind: 'refresh', ttlSeconds: 60 });

    await expect(controller.deactivate({ password: 'Wrong!Pass1' }, requestOf(userId, refresh.jti))).rejects.toMatchObject({ status: 403 });

    expect(await tokens.isRevoked(refresh.jti)).toBe(false);
  });
});
