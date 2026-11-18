import { Inject, Injectable } from '@nestjs/common';

import { normaliseEmail } from '../../config/auth-env';
import { PasswordHasher } from './password-hasher';
import { USER_STORE, type UserStore } from './store/user-store';

const MAX_PASSWORD_LENGTH = 128;

export interface CredentialsCheck {
  readonly userId: string | null;
  readonly accountId: string | null;
}

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

  async verify(email: string, password: string): Promise<string | null> {
    return (await this.check(email, password)).userId;
  }

  /** `accountId` is set for an active account even when the password is wrong: only the audit journal sees it, never the caller of the login form. */
  async check(email: string, password: string): Promise<CredentialsCheck> {
    const user = await this.store.findByEmail(normaliseEmail(email));
    if (user === null || !user.isActive || password.length > MAX_PASSWORD_LENGTH) {
      await this.hasher.verifyAgainstDummy(password.slice(0, MAX_PASSWORD_LENGTH));
      return { userId: null, accountId: user !== null && user.isActive ? user.id : null };
    }
    return (await this.hasher.verify(password, user.passwordHash))
      ? { userId: user.id, accountId: user.id }
      : { userId: null, accountId: user.id };
  }
}
