import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from '@medcenter/fhir-mappers';

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

export const CACHE_KEYS = {
  SERVICES: 'catalog:services',
  SLOTS: (schedule: string, from: string, to: string): string => `slots:${schedule}:${from}:${to}`,
  SCHEDULE_SLOTS: (schedule: string): string => `slots:${schedule}:`,
  /** Built only from an existing Practitioner and a normalized in-window day, so a client cannot grow the key space. */
  DOCTOR_SLOTS_DAY: (practitioner: string, day: string): string =>
    `catalog:doctor-slots:${practitioner}:${day}`,
  /** A schedule knows only its PractitionerRole, not the Practitioner of the key, so slot writes clear the whole namespace. */
  ALL_DOCTOR_SLOTS: 'catalog:doctor-slots:',
  /** `v2`: keeps a bare array cached by an earlier release from being served as the `{ items, meta }` envelope. */
  SERVICES_PAGE: (page: number, pageSize: number, lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): string =>
    `catalog:services:v3:${lang}:${page}:${pageSize}`,
} as const;

export const CACHE_TTLS = {
  SERVICES_SECONDS: 300,
  SLOTS_SECONDS: 15,
} as const;

export const CACHE_STORE = Symbol('CACHE_STORE');

/** One cache page is read per clinic day: an unreachable Redis would otherwise log dozens of identical lines per request. */
const CACHE_WARN_INTERVAL_MS = 10_000;

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly lastWarnAt = new Map<string, number>();
  private store: CacheStore | null = null;

  /** `@Inject(CACHE_STORE)` is required: `CacheStore` is an interface, without the token every read silently misses. */
  constructor(@Optional() @Inject(CACHE_STORE) store?: CacheStore | null) {
    this.store = store ?? null;
  }

  useStore(store: CacheStore | null): void {
    this.store = store;
  }

  /** `shouldCache` keeps an empty answer (before the seed, HAPI warming up) from being served for the whole TTL. */
  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) {
      return cached;
    }
    const value = await loader();
    if (shouldCache(value)) {
      await this.setJson(key, value, ttlSeconds);
    }
    return value;
  }

  /** The cache is shared with other services: a corrupt entry must cost one reload, not a 500. */
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

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.store === null) {
      return;
    }
    try {
      await this.store.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error: unknown) {
      this.warn('write', `Cache write failed: ${key}`, error);
    }
  }

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
