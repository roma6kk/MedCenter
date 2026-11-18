import { Role } from '@medcenter/contracts';

import type { Identity, IdentityResolver } from '../identity';

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
