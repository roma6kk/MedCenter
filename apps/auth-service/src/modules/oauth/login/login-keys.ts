import { hkdfSync } from 'node:crypto';

import { readSessionSecret } from '../../../config/auth-env';

/** Independent HMAC keys of the login surface: a leaked CSRF token never helps forge a session. */
export interface LoginKeys {
  readonly session: Buffer;
  readonly csrf: Buffer;
}

export const LOGIN_KEYS = Symbol('LOGIN_KEYS');

const HKDF_SALT = 'medcenter/auth-service/login';
const KEY_LENGTH = 32;

function derive(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, info, KEY_LENGTH));
}

/**
 * HKDF-SHA256 over `AUTH_SESSION_SECRET` (or, as a fallback, the RS256 private
 * key): the input keying material is never used as an HMAC key directly, and
 * each purpose gets its own key through a distinct `info` label.
 */
export function deriveLoginKeys(secret: string): LoginKeys {
  return { session: derive(secret, 'login-session/v1'), csrf: derive(secret, 'login-csrf/v1') };
}

/** Eager: a missing secret fails the boot, not the first login. */
export function loadLoginKeys(source: NodeJS.ProcessEnv = process.env): LoginKeys {
  return deriveLoginKeys(readSessionSecret(source));
}
