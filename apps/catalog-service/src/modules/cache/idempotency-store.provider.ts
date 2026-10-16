import type { Provider } from '@nestjs/common';
import { IDEMPOTENCY_STORE, type IdempotencyStore } from '@medcenter/common';

import { CACHE_STORE, type CacheStore } from './redis-cache.service';

/** Entries the process-local store keeps before it evicts: keys live 24 h, so a bound keeps memory flat. */
export const MEMORY_STORE_MAX_ENTRIES = 1_000;

/**
 * Process-local fallback for a deployment without Redis, where the cache degrades to always-miss.
 * `main.ts` refuses to boot without `REDIS_URL`, so in practice this store serves tests and a
 * deployment that deliberately runs a single replica.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, { readonly value: string; readonly expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (entry === undefined || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.entries.size >= MEMORY_STORE_MAX_ENTRIES) {
      this.evict();
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** Drops the expired entries; when none expired, the oldest one (Map keeps insertion order). */
  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
    const oldest = this.entries.keys().next();
    if (this.entries.size >= MEMORY_STORE_MAX_ENTRIES && oldest.done !== true) {
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * The `Idempotency-Key` replay store of `POST /admin/schedules/{id}/generate`: the
 * catalog's own Redis cache store (same `get`/`set` contract), so a replay is
 * answered by whichever replica receives it.
 */
export const idempotencyStoreProvider: Provider = {
  provide: IDEMPOTENCY_STORE,
  inject: [CACHE_STORE],
  useFactory: (cache: CacheStore | null): IdempotencyStore => cache ?? new MemoryIdempotencyStore(),
};
