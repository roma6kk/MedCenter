import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { normaliseEmail } from '../../../config/auth-env';
import { LOGIN_ATTEMPT_STORE, type LoginAttemptStore } from './login-attempt-store';

/**
 * Attempts one account may spend per window before the login step refuses it.
 * The per-IP limit (`LOGIN_RATE_LIMIT`) cannot see a distributed search for one
 * password, and the shared `RateLimitGuard` fails open when Redis is down; this
 * counter is the ceiling that holds in both cases.
 */
export const ACCOUNT_ATTEMPT_LIMIT = 10;
export const ACCOUNT_ATTEMPT_WINDOW_SECONDS = 15 * 60;

export type LoginAdmission = 'admitted' | 'throttled' | 'unavailable';

/** The account is identified by a digest, so the counter store never holds an email address. */
export function throttleKeyOf(email: string): string {
  return createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

/**
 * Per-account throttle of `POST /oauth/login`. Every attempt is counted
 * **before** the password is checked — also for emails that do not exist, so
 * the answer never tells which accounts do — and the counter is cleared by a
 * successful login. The attempt that makes the count exceed the limit is
 * already refused, which keeps concurrent guesses from slipping past a
 * read-then-check race.
 *
 * Trade-off, accepted: whoever knows an email can keep that one account out of
 * the login form for the window (10 attempts / 15 min per account, also bounded
 * by the per-IP limit). A distributed guess against a password is the worse
 * failure, and the account stays reachable through the password it has.
 */
@Injectable()
export class LoginThrottle {
  private readonly logger = new Logger(LoginThrottle.name);

  constructor(@Inject(LOGIN_ATTEMPT_STORE) private readonly store: LoginAttemptStore) {}

  /** `unavailable` when the counter cannot be reached: the attempt is refused, never waved through. */
  async admit(email: string): Promise<LoginAdmission> {
    try {
      const attempts = await this.store.record(throttleKeyOf(email), ACCOUNT_ATTEMPT_WINDOW_SECONDS);
      return attempts > ACCOUNT_ATTEMPT_LIMIT ? 'throttled' : 'admitted';
    } catch (error: unknown) {
      this.logger.error({ err: error }, 'Login attempt counter unreachable; refusing the attempt (fail closed)');
      return 'unavailable';
    }
  }

  /** A valid login ends the streak. A failure to clear only leaves the account closer to its limit. */
  async forgive(email: string): Promise<void> {
    try {
      await this.store.clear(throttleKeyOf(email));
    } catch (error: unknown) {
      this.logger.warn({ err: error }, 'Login attempt counter was not cleared; it expires on its own');
    }
  }
}
