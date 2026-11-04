import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  DENYLIST_KEY_PREFIX,
  SESSION_DENYLIST_NAMESPACE,
  type TokenRevocationChecker,
} from './token-revocation';

/** A denylist read must not hold a request up: the guard fails open past this. */
const COMMAND_TIMEOUT_MS = 500;

/**
 * Reads the `session:` entries `auth-service` writes on logout / revoke, so a
 * revoked session is refused by every BFF and not only by the issuer. Errors
 * propagate: `JwtAuthGuard` logs them and fails open.
 */
export class RedisTokenRevocationChecker implements TokenRevocationChecker {
  constructor(private readonly client: Pick<Redis, 'exists'>) {}

  async isRevoked(key: string): Promise<boolean> {
    const found = await this.client.exists(`${DENYLIST_KEY_PREFIX}${SESSION_DENYLIST_NAMESPACE}${key}`);
    return found > 0;
  }
}

let sharedChecker: { readonly url: string; readonly checker: TokenRevocationChecker } | null = null;

/**
 * Checker for a service that binds no `TOKEN_REVOCATION` of its own: Redis when
 * `REDIS_URL` is set (compose, production), `null` (no check) otherwise — unit
 * and e2e runs. One connection per process, opened on the first request.
 */
export function createDefaultRevocationChecker(
  source: NodeJS.ProcessEnv = process.env,
): TokenRevocationChecker | null {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return null;
  }
  if (sharedChecker?.url === url) {
    return sharedChecker.checker;
  }
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: COMMAND_TIMEOUT_MS,
  });
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure would crash the process.
    new Logger(RedisTokenRevocationChecker.name).warn(`Revocation Redis connection error: ${error.message}`);
  });
  sharedChecker = { url, checker: new RedisTokenRevocationChecker(client) };
  return sharedChecker.checker;
}
