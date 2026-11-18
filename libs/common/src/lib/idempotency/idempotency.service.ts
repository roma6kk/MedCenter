import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

export interface IdempotencyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setIfAbsent?(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  delete?(key: string): Promise<void>;
}

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Longer than one booking takes, short enough that the key frees itself when the process dies. */
export const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CachedEntry {
  readonly fingerprint: string;
  readonly response: unknown;
}

type Claim = 'claimed' | 'busy' | 'unguarded';

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

/** Replays the first successful response of an `Idempotency-Key`, scoped to the caller. Another body under the same key, or a request still running, is 409; failures stay retryable. A failed cache write is logged, not thrown: the operation already happened. */
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
