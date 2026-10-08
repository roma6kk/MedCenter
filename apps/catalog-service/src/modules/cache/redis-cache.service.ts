import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';

/**
 * Minimal cache contract. Kept narrow so the whole service can be exercised
 * with an in-memory fake (tests) while production wires an ioredis-backed
 * implementation (NFR-005 — slot search < 500 ms).
 *
 * `del` removes exact keys; `delByPrefix` removes every key starting with the
 * prefix (SCAN-based, non-blocking) — invalidation of a whole schedule's slot
 * pages relies on the prefix form (see `CACHE_KEYS.SCHEDULE_SLOTS`).
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

/** Deterministic key namespace (API §5 — invalidation is done by these prefixes). */
export const CACHE_KEYS = {
  SERVICES: 'catalog:services',
  DOCTORS: (service: string): string => `catalog:doctors:${service}`,
  SLOTS: (schedule: string, from: string, to: string): string => `slots:${schedule}:${from}:${to}`,
  /** Prefix used to invalidate every cached slot page of one schedule. */
  SCHEDULE_SLOTS: (schedule: string): string => `slots:${schedule}:`,
} as const;

export const CACHE_TTLS = {
  SERVICES_SECONDS: 300,
  DOCTORS_SECONDS: 300,
  SLOTS_SECONDS: 15,
} as const;

/** DI token for the concrete cache backend (ioredis in production). */
export const CACHE_STORE = Symbol('CACHE_STORE');

/**
 * Thin read-through wrapper over the cache store.
 *
 * When no store is bound the service degrades to "always miss" rather than
 * failing the request — the catalog stays correct, only slower.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private store: CacheStore | null = null;

  constructor(@Optional() store?: CacheStore) {
    this.store = store ?? null;
  }

  /** Wiring seam used by the Nest module and by tests. */
  useStore(store: CacheStore | null): void {
    this.store = store;
  }

  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.read(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
    const value = await loader();
    await this.write(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidates exact keys and/or every key under a prefix. Prefixes (ending
   * with `:` in the SCHEDULE_SLOTS convention) are expanded through
   * `delByPrefix` so `slots:<id>:` clears all cached pages of the schedule.
   */
  async invalidate(keys: string[]): Promise<void> {
    if (this.store === null) {
      return;
    }
    const store = this.store;
    try {
      const prefixes = keys.filter((key) => key.endsWith(':'));
      const exact = keys.filter((key) => !key.endsWith(':'));
      await Promise.all([
        ...(exact.length > 0 ? [store.del(exact)] : []),
        ...prefixes.map((prefix) => store.delByPrefix(prefix)),
      ]);
    } catch (error: unknown) {
      this.logger.warn(error as Error, 'Cache invalidate failed, stale entries may persist');
    }
  }

  private async read(key: string): Promise<string | null> {
    if (this.store === null) {
      return null;
    }
    try {
      return await this.store.get(key);
    } catch (error: unknown) {
      this.logger.warn(error as Error, `Cache read failed, falling through: ${key}`);
      return null;
    }
  }

  private async write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.store === null) {
      return;
    }
    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error: unknown) {
      this.logger.warn(error as Error, `Cache write failed: ${key}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.store = null;
  }
}
