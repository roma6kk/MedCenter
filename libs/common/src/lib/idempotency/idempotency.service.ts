import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

/** Minimal key/value contract; Redis in production, a Map in unit tests. */
export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/** API §0: a replayed `Idempotency-Key` is answered from cache for 24 h. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a cache entry holds: the request it answered and the response to replay. */
interface CachedEntry {
  readonly fingerprint: string;
  readonly response: unknown;
}

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
 * Store failures: a failed read fails the request before anything ran (the client
 * may retry safely). A failed write happens after the operation succeeded, so it is
 * logged and the result is still returned: a 500 for a booking or a generation that
 * went through would make the client retry something that already happened.
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
      const entry = JSON.parse(cached) as CachedEntry;
      if (entry.fingerprint !== fingerprint) {
        throw new ConflictException({
          errorCode: 'CONFLICT',
          message: 'CONFLICT: Idempotency-Key was already used with a different request body',
        });
      }
      return entry.response as T;
    }

    const result = await operation();
    await this.remember(scope, storeKey, { fingerprint, response: result });
    return result;
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
