import { Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export interface TerminologyCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

export const TERMINOLOGY_CACHE = Symbol('TERMINOLOGY_CACHE');

const MAX_ENTRIES = 500;

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

export class InMemoryTerminologyCache implements TerminologyCache {
  private readonly entries = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) {
        this.entries.delete(oldest.value);
      }
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  scan(cursor: string, match: 'MATCH', pattern: string, count: 'COUNT', size: number): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
  quit(): Promise<unknown>;
}

const SCAN_BATCH = 200;

/** `SCAN MATCH` treats `* ? [ ] \` as glob syntax; a prefix is a literal. */
function literalPattern(prefix: string): string {
  return `${prefix.replace(/[\\*?[\]]/g, '\\$&')}*`;
}

export class RedisTerminologyCache implements TerminologyCache, OnModuleDestroy {
  private readonly logger = new Logger(RedisTerminologyCache.name);

  constructor(private readonly redis: RedisLike) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error: unknown) {
      this.logger.warn({ err: error, key }, 'Terminology cache read failed; falling through to HAPI');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error: unknown) {
      this.logger.warn({ err: error, key }, 'Terminology cache write failed');
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', literalPattern(prefix), 'COUNT', SCAN_BATCH);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        cursor = next;
      } while (cursor !== '0');
    } catch (error: unknown) {
      this.logger.warn({ err: error, prefix }, 'Terminology cache invalidation failed; entries expire on their own');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Terminology cache connection did not close cleanly');
    });
  }
}

export function createTerminologyCache(source: NodeJS.ProcessEnv = process.env): TerminologyCache {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return new InMemoryTerminologyCache();
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  client.on('error', (error: Error) => {
    // idle connection failure would crash the process
    new Logger(RedisTerminologyCache.name).warn({ err: error }, 'Terminology cache Redis connection error');
  });
  return new RedisTerminologyCache(client);
}
