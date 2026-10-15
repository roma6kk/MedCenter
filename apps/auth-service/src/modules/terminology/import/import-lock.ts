import { randomUUID } from 'node:crypto';

import { Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Single-flight guard of the snapshot import (API 2.3.4): at most one import
 * runs at a time across every replica of the service. The lease expires on its
 * own, so an import whose process died cannot block the next one forever.
 */
export interface ImportLease {
  release(): Promise<void>;
}

export interface ImportLock {
  /** The lease, or `null` when an import already holds the lock. */
  acquire(ttlSeconds: number): Promise<ImportLease | null>;
}

export const IMPORT_LOCK = Symbol('IMPORT_LOCK');

export const IMPORT_LOCK_KEY = 'terminology:import:lock';

/** Per-process lock: enough for one replica (local runs without Redis). */
export class InMemoryImportLock implements ImportLock {
  private expiresAt = 0;
  private token: string | null = null;

  async acquire(ttlSeconds: number): Promise<ImportLease | null> {
    if (this.token !== null && this.expiresAt > Date.now()) {
      return null;
    }
    const token = randomUUID();
    this.token = token;
    this.expiresAt = Date.now() + ttlSeconds * 1000;
    return {
      release: async (): Promise<void> => {
        if (this.token === token) {
          this.token = null;
        }
      },
    };
  }
}

/** The subset of ioredis the lock uses, so tests can pass a fake. */
export interface RedisLockClient {
  set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
}

/** Deletes the key only while this holder still owns it: a lease that expired must not free a newer one. */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Redis `SET key token NX EX ttl`, shared by every replica. A Redis failure is
 * not swallowed: an import that cannot prove it is the only one does not start.
 *
 * A lease still held when the module is destroyed (the process got `SIGTERM`
 * in the middle of an import) is released before the connection closes: the
 * import dies with the process, and its lease would otherwise keep every
 * replica answering `409 IMPORT_RUNNING` until the TTL runs out.
 */
export class RedisImportLock implements ImportLock, OnModuleDestroy {
  private readonly logger = new Logger(RedisImportLock.name);
  private readonly held = new Set<ImportLease>();

  constructor(private readonly redis: RedisLockClient) {}

  async acquire(ttlSeconds: number): Promise<ImportLease | null> {
    const token = randomUUID();
    const granted = await this.redis.set(IMPORT_LOCK_KEY, token, 'EX', ttlSeconds, 'NX');
    if (granted !== 'OK') {
      return null;
    }
    const lease: ImportLease = {
      release: async (): Promise<void> => {
        this.held.delete(lease);
        try {
          await this.redis.eval(RELEASE_SCRIPT, 1, IMPORT_LOCK_KEY, token);
        } catch (error: unknown) {
          // The lease expires by itself; a failed release only delays the next import.
          this.logger.warn({ err: error }, 'Import lock was not released; it expires on its own');
        }
      },
    };
    this.held.add(lease);
    return lease;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.held.size > 0) {
      this.logger.warn({ leases: this.held.size }, 'Shutting down during a terminology import; releasing its lock');
    }
    for (const lease of [...this.held]) {
      await lease.release();
    }
    await this.redis.quit().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Import lock connection did not close cleanly');
    });
  }
}

/** Redis when `REDIS_URL` is set (compose, production), the in-process lock otherwise. */
export function createImportLock(source: NodeJS.ProcessEnv = process.env): ImportLock {
  const url = source['REDIS_URL'];
  if (url === undefined || url === '') {
    return new InMemoryImportLock();
  }
  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  client.on('error', (error: Error) => {
    // Without a listener an idle connection failure would crash the process.
    new Logger(RedisImportLock.name).warn({ err: error }, 'Import lock Redis connection error');
  });
  return new RedisImportLock(client);
}
