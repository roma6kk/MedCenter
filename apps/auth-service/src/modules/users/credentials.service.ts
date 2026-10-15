import { Inject, Injectable } from '@nestjs/common';

import { normaliseEmail } from '../../config/auth-env';
import { PasswordHasher } from './password-hasher';
import { USER_STORE, type UserStore } from './store/user-store';

/** Longest password ever compared; anything longer cannot match a stored one. */
const MAX_PASSWORD_LENGTH = 128;

/**
 * Verifies an email/password pair for the authorization server's login form
 * (assumption UI-1). Every negative outcome — unknown email, inactive
 * account, wrong password — is the same `null` and costs the same scrypt
 * work, so neither the answer nor its timing reveals which accounts exist.
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(USER_STORE) private readonly store: UserStore,
    private readonly hasher: PasswordHasher,
  ) {}

  /** The user id when the credentials are valid for an active account, `null` otherwise. */
  async verify(email: string, password: string): Promise<string | null> {
    const user = await this.store.findByEmail(normaliseEmail(email));
    if (user === null || !user.isActive || password.length > MAX_PASSWORD_LENGTH) {
      await this.hasher.verifyAgainstDummy(password.slice(0, MAX_PASSWORD_LENGTH));
      return null;
    }
    return (await this.hasher.verify(password, user.passwordHash)) ? user.id : null;
  }
}
