import { hkdfSync } from 'node:crypto';

import { readSessionSecret } from '../../../config/auth-env';

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

export function deriveLoginKeys(secret: string): LoginKeys {
  return { session: derive(secret, 'login-session/v1'), csrf: derive(secret, 'login-csrf/v1') };
}

export function loadLoginKeys(source: NodeJS.ProcessEnv = process.env): LoginKeys {
  return deriveLoginKeys(readSessionSecret(source));
}
