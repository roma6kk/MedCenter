import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };

const SCHEME = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Upper bounds for parameters read back from `users.password_hash`: a tampered
 * row must not be able to make a single verification allocate gigabytes.
 */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r + 1024 * 1024 };
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

function parseHash(encoded: string): ParsedHash | null {
  const [scheme, n, r, p, salt, key, ...rest] = encoded.split('$');
  if (scheme !== SCHEME || rest.length > 0 || salt === undefined || key === undefined) {
    return null;
  }
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  const isSane =
    isPowerOfTwo(params.N) && params.N <= MAX_N &&
    Number.isInteger(params.r) && params.r >= 1 && params.r <= MAX_R &&
    Number.isInteger(params.p) && params.p >= 1 && params.p <= MAX_P;
  if (!isSane) {
    return null;
  }
  return { params, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}

@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  constructor(private readonly params: ScryptParams = DEFAULT_SCRYPT_PARAMS) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, this.params);
    const { N, r, p } = this.params;
    return [SCHEME, N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parseHash(encoded);
    if (parsed === null || parsed.key.length !== KEY_LENGTH) {
      return false;
    }
    const candidate = await derive(password, parsed.salt, parsed.params);
    return timingSafeEqual(candidate, parsed.key);
  }

  /**
   * Burns the same scrypt cost as a real verification. Used when the email is
   * unknown or the account is inactive, so response timing does not reveal
   * which accounts exist (no user enumeration).
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    await this.verify(password, await this.dummyHash);
    return false;
  }
}
