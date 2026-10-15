import { Role } from '@medcenter/contracts';

import type { Identity, IdentityResolver } from '../identity';

/**
 * Test double for the `auth`-schema identity lookup. Unknown users resolve to
 * `defaultRole` (PATIENT) without links unless they are listed explicitly; a
 * `null` entry models a deactivated or deleted account.
 */
export class StubIdentityResolver implements IdentityResolver {
  private readonly identities = new Map<string, Identity | null>();

  constructor(private readonly defaultRole: Role = Role.PATIENT) {}

  set(userId: string, identity: Omit<Identity, 'userId'> | null): this {
    this.identities.set(userId, identity === null ? null : { userId, ...identity });
    return this;
  }

  async resolve(userId: string): Promise<Identity | null> {
    const known = this.identities.get(userId);
    if (known !== undefined) {
      return known;
    }
    return { userId, role: this.defaultRole };
  }
}
