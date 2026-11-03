import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

/**
 * Minimal key/value contract; Redis in production, a Map in unit tests.
 *
 * `setIfAbsent` and `delete` let the service mark a request as in flight (see `IdempotencyService`). They are
 * optional: a store without them still replays finished requests and only lacks that guard.
 */
export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Stores the value only when the key is free (Redis `SET key value EX ttl NX`); `false` when it was taken. */
  setIfAbsent?(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Removes the key. */
  delete?(key: string): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/** API §0: a replayed `Idempotency-Key` is answered from cache for 24 h. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * How long a request in flight holds its key: longer than one booking takes, short enough that the key frees
 * itself when the process dies before it can release it.
 */
export const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a cache entry holds: the request it answered and the response to replay. */
interface CachedEntry {
  readonly fingerprint: string;
  readonly response: unknown;
}

/** Who owns the key while a request runs: this request, another one, or nobody can tell (the store has no lock). */
type Claim = 'claimed' | 'busy' | 'unguarded';

/**
 * SHA-256 of the request with object keys sorted, so the same body always yields
 * the same digest regardless of JSON key order.
 */
export function fingerprintOf(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(request))).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortKeys(record[key])]));
  }
  return value;
}

/** The cached response, unless the key was used for another request body. */
function replayOf<T>(cached: string, fingerprint: string): T {
  const entry = JSON.parse(cached) as CachedEntry;
  if (entry.fingerprint !== fingerprint) {
    throw new ConflictException({
      errorCode: 'CONFLICT',
      message: 'CONFLICT: Idempotency-Key was already used with a different request body',
    });
  }
  return entry.response as T;
}

/**
 * Replays the first successful response for a given `Idempotency-Key`, so a
 * retried `POST /appointments` never books twice. The key is scoped to the
 * caller (`scope`), so one user cannot replay another user's response.
 *
 * The cache also stores the request fingerprint. Reusing a key for a different
 * body is refused with `409 CONFLICT` instead of silently replaying the first
 * response for a request the client did not send now.
 *
 * Only successful responses are cached: a failed attempt (e.g. `SLOT_CONFLICT`)
 * stays retryable.
 *
 * A request that is still running holds the key (`<key>:lock`, `IDEMPOTENCY_LOCK_TTL_SECONDS`): a retry sent
 * meanwhile is refused with `409 CONFLICT` instead of running the operation a second time, where it would lose the
 * race for the slot and report a conflict for a booking that exists. The lock is released when the operation ends,
 * whether it succeeded or not. After a successful claim the cache is read once more, because the request ahead may
 * have finished between the first read and the claim.
 *
 * Store failures: a failed read fails the request before anything ran (the client
 * may retry safely). A failed write happens after the operation succeeded, so it is
 * logged and the result is still returned: a 500 for a booking or a generation that
 * went through would make the client retry something that already happened. A store that cannot
 * take the lock (down, or without `setIfAbsent`) leaves the request unguarded, as before the lock existed.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore) {}

  async run<T>(scope: string, key: string | undefined, request: unknown, operation: () => Promise<T>): Promise<T> {
    if (key === undefined) {
      return operation();
    }
    if (!UUID_PATTERN.test(key)) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must be a UUID',
      });
    }

    const storeKey = `idempotency:${scope}:${key}`;
    const fingerprint = fingerprintOf(request);
    const cached = await this.store.get(storeKey);
    if (cached !== null) {
      return replayOf<T>(cached, fingerprint);
    }

    const lockKey = `${storeKey}:lock`;
    const claim = await this.claim(scope, lockKey);
    if (claim === 'busy') {
      throw new ConflictException({
        errorCode: 'CONFLICT',
        message: 'CONFLICT: a request with this Idempotency-Key is still being processed, retry shortly',
      });
    }
    try {
      if (claim === 'claimed') {
        const settled = await this.store.get(storeKey);
        if (settled !== null) {
          return replayOf<T>(settled, fingerprint);
        }
      }
      const result = await operation();
      await this.remember(scope, storeKey, { fingerprint, response: result });
      return result;
    } finally {
      if (claim === 'claimed') {
        await this.release(scope, lockKey);
      }
    }
  }

  /** Takes the in-flight mark; a store that cannot (down, or no `setIfAbsent`/`delete`) never blocks the request. */
  private async claim(scope: string, lockKey: string): Promise<Claim> {
    if (this.store.setIfAbsent === undefined || this.store.delete === undefined) {
      return 'unguarded';
    }
    try {
      return (await this.store.setIfAbsent(lockKey, '1', IDEMPOTENCY_LOCK_TTL_SECONDS)) ? 'claimed' : 'busy';
    } catch (error: unknown) {
      this.logger.warn(
        { scope, err: error instanceof Error ? error.message : String(error) },
        'The idempotency store did not take the in-flight mark; this request runs without protection against a concurrent retry',
      );
      return 'unguarded';
    }
  }

  /** Frees the key for a retry; when the store refuses, the mark expires on its own. */
  private async release(scope: string, lockKey: string): Promise<void> {
    try {
      await this.store.delete?.(lockKey);
    } catch (error: unknown) {
      this.logger.warn(
        { scope, err: error instanceof Error ? error.message : String(error) },
        `The idempotency store did not release the in-flight mark; it expires in ${IDEMPOTENCY_LOCK_TTL_SECONDS} s`,
      );
    }
  }

  /** Stores the replayable answer; the operation already succeeded, so a store outage is only a lost replay. */
  private async remember(scope: string, storeKey: string, entry: CachedEntry): Promise<void> {
    try {
      await this.store.set(storeKey, JSON.stringify(entry), IDEMPOTENCY_TTL_SECONDS);
    } catch (error: unknown) {
      this.logger.warn(
        { scope, err: error instanceof Error ? error.message : String(error) },
        'The idempotency store did not take the answer; a replay of this key will run the operation again',
      );
    }
  }
}
