import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';

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
  /**
   * Free slots of one doctor for one clinic calendar day (API §5.2.8). The key is
   * built only from a Practitioner that exists and a normalized `YYYY-MM-DD`
   * inside the lookahead window, so however a client spells its range the
   * number of keys stays finite (doctors x about 400 days).
   */
  DOCTOR_SLOTS_DAY: (practitioner: string, day: string): string =>
    `catalog:doctor-slots:${practitioner}:${day}`,
  /**
   * Prefix of every doctor slot page. A schedule only knows its PractitionerRole,
   * not the Practitioner the public key is built from, so slot writes clear the
   * whole namespace — admin writes are rare and the TTL is 15 s anyway.
   */
  ALL_DOCTOR_SLOTS: 'catalog:doctor-slots:',
  /** One page of the public services listing without a search term (API §5.1.1). */
  SERVICES_PAGE: (page: number, pageSize: number): string => `catalog:services:${page}:${pageSize}`,
} as const;

export const CACHE_TTLS = {
  SERVICES_SECONDS: 300,
  DOCTORS_SECONDS: 300,
  SLOTS_SECONDS: 15,
} as const;

/** DI token for the concrete cache backend (ioredis in production). */
export const CACHE_STORE = Symbol('CACHE_STORE');

/**
 * Minimum gap between two warnings of the same kind. A request reads and
 * writes one cache page per clinic day, so an unreachable Redis would otherwise
 * log dozens of identical lines per request.
 */
export const CACHE_WARN_INTERVAL_MS = 10_000;

/**
 * Thin read-through wrapper over the cache store.
 *
 * When no store is bound the service degrades to "always miss" rather than
 * failing the request — the catalog stays correct, only slower.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly lastWarnAt = new Map<string, number>();
  private store: CacheStore | null = null;

  /**
   * `@Inject(CACHE_STORE)` is required: `CacheStore` is an interface, so without
   * the token Nest has no runtime type to resolve, `@Optional()` yields
   * `undefined` and every read silently misses (NFR-005).
   */
  constructor(@Optional() @Inject(CACHE_STORE) store?: CacheStore | null) {
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
    const cached = await this.getJson<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await loader();
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  /**
   * Reads one JSON entry. A missing, unreadable or corrupt entry is a miss
   * (`null`): the cache is shared with other services, so a damaged value must
   * cost one reload, not a 500.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const cached = await this.read(key);
    if (cached === null) {
      return null;
    }
    try {
      return JSON.parse(cached) as T;
    } catch (error: unknown) {
      this.warn('corrupt', `Cache entry is not valid JSON, treating as a miss: ${key}`, error);
      return null;
    }
  }

  /** Writes one JSON entry; a store failure is logged and never fails the request. */
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.write(key, value, ttlSeconds);
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
      this.warn('invalidate', 'Cache invalidate failed, stale entries may persist', error);
    }
  }

  private async read(key: string): Promise<string | null> {
    if (this.store === null) {
      return null;
    }
    try {
      return await this.store.get(key);
    } catch (error: unknown) {
      this.warn('read', `Cache read failed, falling through: ${key}`, error);
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
      this.warn('write', `Cache write failed: ${key}`, error);
    }
  }

  /** One compact line (no stack) per kind per `CACHE_WARN_INTERVAL_MS`; the rest are dropped. */
  private warn(kind: string, message: string, error: unknown): void {
    const nowMs = Date.now();
    if (nowMs - (this.lastWarnAt.get(kind) ?? 0) < CACHE_WARN_INTERVAL_MS) {
      return;
    }
    this.lastWarnAt.set(kind, nowMs);
    this.logger.warn(`${message} (${error instanceof Error ? error.message : String(error)})`);
  }

  async onModuleDestroy(): Promise<void> {
    this.store = null;
  }
}
