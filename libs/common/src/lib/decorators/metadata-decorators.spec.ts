import { Reflector } from '@nestjs/core';
import { Role } from '@medcenter/contracts';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { RATE_LIMIT_KEY, RateLimit } from './rate-limit.decorator';
import { REQUIRES_ROLES_KEY, RequiresRoles } from './requires-roles.decorator';
import { REQUIRES_SCOPES_KEY, RequiresScopes } from './requires-scopes.decorator';

class SampleController {
  @Public()
  open(): string {
    return 'open';
  }

  @RateLimit(20)
  throttled(): string {
    return 'throttled';
  }

  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  staff(): string {
    return 'staff';
  }

  @RequiresScopes('user/*.write', 'patient/*.write')
  writing(): string {
    return 'writing';
  }

  undecorated(): string {
    return 'plain';
  }
}

describe('metadata decorators', () => {
  const reflector = new Reflector();

  it('should expose the exact metadata keys the guards read', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
    expect(RATE_LIMIT_KEY).toBe('rateLimitPerMinute');
    expect(REQUIRES_ROLES_KEY).toBe('requiresRoles');
    expect(REQUIRES_SCOPES_KEY).toBe('requiresScopes');
  });

  it('should mark a @Public route as public', () => {
    expect(reflector.get(IS_PUBLIC_KEY, SampleController.prototype.open)).toBe(true);
  });

  it('should store the @RateLimit budget on the route', () => {
    expect(reflector.get(RATE_LIMIT_KEY, SampleController.prototype.throttled)).toBe(20);
  });

  it('should store every @RequiresRoles role in order', () => {
    expect(reflector.get(REQUIRES_ROLES_KEY, SampleController.prototype.staff)).toEqual([
      Role.DOCTOR,
      Role.ADMIN,
    ]);
  });

  it('should store every @RequiresScopes scope in order', () => {
    expect(reflector.get(REQUIRES_SCOPES_KEY, SampleController.prototype.writing)).toEqual([
      'user/*.write',
      'patient/*.write',
    ]);
  });

  it('should attach no guard metadata to an undecorated route', () => {
    const target = SampleController.prototype.undecorated;

    expect(reflector.get(IS_PUBLIC_KEY, target)).toBeUndefined();
    expect(reflector.get(RATE_LIMIT_KEY, target)).toBeUndefined();
    expect(reflector.get(REQUIRES_ROLES_KEY, target)).toBeUndefined();
    expect(reflector.get(REQUIRES_SCOPES_KEY, target)).toBeUndefined();
  });
});
