import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { normaliseEmail } from '../../../config/auth-env';
import { LOGIN_ATTEMPT_STORE, type LoginAttemptStore } from './login-attempt-store';

// The per-IP limit cannot see a distributed search for one password and RateLimitGuard fails open without Redis.
export const ACCOUNT_ATTEMPT_LIMIT = 10;
export const ACCOUNT_ATTEMPT_WINDOW_SECONDS = 15 * 60;

type LoginAdmission = 'admitted' | 'throttled' | 'unavailable';

export function throttleKeyOf(email: string): string {
  return createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

// Counted before the password check, also for unknown emails (no account enumeration); the over-limit attempt is already refused (no read-then-check race).
@Injectable()
export class LoginThrottle {
  private readonly logger = new Logger(LoginThrottle.name);

  constructor(@Inject(LOGIN_ATTEMPT_STORE) private readonly store: LoginAttemptStore) {}

  async admit(email: string): Promise<LoginAdmission> {
    try {
      const attempts = await this.store.record(throttleKeyOf(email), ACCOUNT_ATTEMPT_WINDOW_SECONDS);
      return attempts > ACCOUNT_ATTEMPT_LIMIT ? 'throttled' : 'admitted';
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Login attempt counter unreachable; refusing the attempt (fail closed)');
      return 'unavailable';
    }
  }

  async forgive(email: string): Promise<void> {
    try {
      await this.store.clear(throttleKeyOf(email));
    } catch (error: unknown) {
      this.logger.warn({ err: error }, 'Login attempt counter was not cleared; it expires on its own');
    }
  }
}
