import type { Provider } from '@nestjs/common';
import { IDEMPOTENCY_STORE, type IdempotencyStore } from '@medcenter/common';

import { CACHE_STORE, type CacheStore } from './redis-cache.service';

export const MEMORY_STORE_MAX_ENTRIES = 1_000;

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

  /** Check and write in one synchronous step, so two concurrent callers never both get `true`. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.entries.get(key);
    if (entry !== undefined && entry.expiresAt > Date.now()) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

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

export const idempotencyStoreProvider: Provider = {
  provide: IDEMPOTENCY_STORE,
  inject: [CACHE_STORE],
  useFactory: (cache: CacheStore | null): IdempotencyStore => cache ?? new MemoryIdempotencyStore(),
};
