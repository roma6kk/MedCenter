import { Inject, Injectable } from '@nestjs/common';

import { primaryRole, type Identity, type IdentityResolver } from '../oauth/identity';
import { USER_STORE, type UserStore } from './store/user-store';

/**
 * `IdentityResolver` over the `auth` schema: the token of every grant is
 * minted from the account as it is *now* — an inactive account or one without
 * any role resolves to `null` and gets no token; `patient`/`fhirUser` come
 * from the account's `ExternalLink` rows.
 */
@Injectable()
export class UserIdentityResolver implements IdentityResolver {
  constructor(@Inject(USER_STORE) private readonly store: UserStore) {}

  async resolve(userId: string): Promise<Identity | null> {
    const user = await this.store.findById(userId);
    if (user === null || !user.isActive) {
      return null;
    }
    const role = primaryRole(user.roles);
    if (role === null) {
      return null;
    }
    return {
      userId: user.id,
      role,
      ...(user.links.patientId !== undefined ? { patientId: user.links.patientId } : {}),
      ...(user.links.practitionerRoleId !== undefined ? { practitionerRoleId: user.links.practitionerRoleId } : {}),
    };
  }
}
