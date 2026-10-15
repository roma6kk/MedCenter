import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { TOKEN_DENYLIST, type TokenDenylist } from '../token.service';
import { LOGIN_KEYS, type LoginKeys } from './login-keys';
import { signValue, verifySignedValue } from './signed-value';

/**
 * The session only has to survive `POST /oauth/login` → 302 →
 * `GET /oauth/authorize`; five minutes covers a slow network, not a workday.
 */
export const LOGIN_SESSION_TTL_SECONDS = 300;

/** How long a rendered login form stays submittable. */
export const LOGIN_CSRF_TTL_SECONDS = 30 * 60;

/** Denylist namespace of consumed sessions (distinct from the token `reuse:`/`session:` ones). */
const CONSUMED_PREFIX = 'login:';

const sessionPayloadSchema = z.object({
  v: z.literal(1),
  sub: z.string().min(1),
  sid: z.string().min(1),
  exp: z.number().int(),
});

export interface LoginSession {
  readonly userId: string;
  readonly sessionId: string;
}

/** The CSRF cookie holds a random nonce; the form field holds its MAC (signed double-submit). */
export interface CsrfPair {
  readonly cookie: string;
  readonly field: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Authorization-server login session (assumption UI-1). Stateless and signed
 * (HMAC-SHA256, HKDF-derived key), short-lived and **single-use**: once
 * `GET /oauth/authorize` has issued a code with it, `end()` records its id in
 * the denylist, so a browser left behind after a logout cannot silently mint
 * a new code for the previous user.
 */
@Injectable()
export class LoginSessionService {
  constructor(
    @Inject(LOGIN_KEYS) private readonly keys: LoginKeys,
    @Inject(TOKEN_DENYLIST) private readonly denylist: TokenDenylist,
  ) {}

  /** The signed cookie value of a fresh session for `userId`. */
  issue(userId: string): string {
    return signValue(
      { v: 1, sub: userId, sid: randomUUID(), exp: nowSeconds() + LOGIN_SESSION_TTL_SECONDS },
      this.keys.session,
    );
  }

  /** `null` for an absent, forged, expired or already consumed session. */
  async read(cookie: string | undefined): Promise<LoginSession | null> {
    if (cookie === undefined || cookie.length === 0) {
      return null;
    }
    const parsed = sessionPayloadSchema.safeParse(verifySignedValue(cookie, this.keys.session));
    if (!parsed.success || parsed.data.exp <= nowSeconds()) {
      return null;
    }
    if (await this.denylist.has(`${CONSUMED_PREFIX}${parsed.data.sid}`)) {
      return null;
    }
    return { userId: parsed.data.sub, sessionId: parsed.data.sid };
  }

  /** Consumes the session: it can never authorize a second request. */
  async end(sessionId: string): Promise<void> {
    await this.denylist.add(`${CONSUMED_PREFIX}${sessionId}`, LOGIN_SESSION_TTL_SECONDS);
  }

  issueCsrf(): CsrfPair {
    const cookie = randomBytes(32).toString('base64url');
    return { cookie, field: this.csrfMac(cookie).toString('base64url') };
  }

  verifyCsrf(cookie: string | undefined, field: string | undefined): boolean {
    if (cookie === undefined || cookie.length === 0 || field === undefined || field.length === 0) {
      return false;
    }
    const expected = this.csrfMac(cookie);
    const presented = Buffer.from(field, 'base64url');
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private csrfMac(nonce: string): Buffer {
    return createHmac('sha256', this.keys.csrf).update(nonce).digest();
  }
}
