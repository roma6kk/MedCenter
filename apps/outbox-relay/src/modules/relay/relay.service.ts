import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  commitTransaction,
  FHIR_CLIENT,
  parseOutboxRecord,
  withOutboxStatus,
  type FhirClient,
  type FhirResource,
  type OutboxRecord,
  type TransactionWrite,
} from '@medcenter/fhir';
import { EVENT_PUBLISHER, type DomainEvent, type EventPublisher } from '@medcenter/messaging';
import { OUTBOX } from '@medcenter/terminology';

import { RELAY_CONFIG, type RelayConfig } from './relay.config';
import { LOCK_STORE, type LockStore } from './redis-lock';

export const LOCK_KEY = 'outbox-relay:lock';
/** One poll never holds the lock for longer than this share of its lifetime. */
const LOCK_BUDGET_SHARE = 0.5;

const CODE_SEARCH = `${OUTBOX.CODE_SYSTEM}|${OUTBOX.EVENT_CODE}`;
const tagSearch = (status: string): string => `${OUTBOX.STATUS_SYSTEM}|${status}`;

/**
 * Transactional-outbox relay (ADR-021). Reads `pending` outbox `Basic` records,
 * publishes each event and marks the batch `sent` in one transaction with
 * `If-Match` on the versions it read. Delivery is at-least-once: a crash between
 * publish and mark, or a lost `If-Match` race, repeats events; consumers dedup by
 * `eventId`. The event payload is opaque text here and is never logged.
 *
 * Only one replica polls at a time (Redis lock). `sent` records older than the
 * retention window are deleted and expunged; `pending` records are never deleted.
 */
@Injectable()
export class RelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RelayService.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopped = false;
  private lastHousekeeping = 0;

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(LOCK_STORE) private readonly lock: LockStore,
    @Inject(RELAY_CONFIG) private readonly config: RelayConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env['OUTBOX_RELAY_ENABLED'] === 'false') {
      return;
    }
    this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    await this.inFlight;
    await this.lock.close().catch(() => undefined);
  }

  /** One poll under the lock; resolves (never rejects) so the loop keeps going. */
  async tick(now: Date = new Date()): Promise<void> {
    const token = randomUUID();
    try {
      if (!(await this.lock.acquire(LOCK_KEY, token, this.config.lockTtlMs))) {
        return;
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'outbox lock is unavailable; skipping this poll');
      return;
    }
    try {
      await this.dispatchPending();
      if (now.getTime() - this.lastHousekeeping >= this.config.housekeepingIntervalMs) {
        this.lastHousekeeping = now.getTime();
        await this.warnAboutStalePending(now);
        await this.purgeSent(now);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'outbox poll failed; it is retried on the next tick');
    } finally {
      await this.lock.release(LOCK_KEY, token).catch((error: unknown) => {
        this.logger.warn({ err: error }, 'outbox lock was not released; it expires on its own');
      });
    }
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.tick().finally(() => {
        this.inFlight = undefined;
        if (!this.stopped) {
          this.schedule();
        }
      });
    }, this.config.pollIntervalMs);
  }

  /** Publishes and marks batches until none is left or the lock budget is spent. */
  private async dispatchPending(): Promise<void> {
    const deadline = Date.now() + this.config.lockTtlMs * LOCK_BUDGET_SHARE;
    for (;;) {
      const result = await this.fhir.search('Basic', {
        code: CODE_SEARCH,
        _tag: tagSearch(OUTBOX.PENDING),
        _sort: '_lastUpdated',
        _count: this.config.batchSize,
      });
      const entries = result.entry ?? [];
      const records = entries.map((entry) => this.recordOf(entry.resource)).filter((record): record is OutboxRecord => record !== undefined);
      const published = await this.publishInOrder(records);
      if (published.length > 0) {
        await this.markSent(published);
      }
      // A short or skipped batch means a failure or a poison record: stop instead of re-reading it in a tight loop.
      const complete = published.length === entries.length;
      if (!complete || entries.length < this.config.batchSize || Date.now() >= deadline) {
        return;
      }
    }
  }

  private recordOf(resource: FhirResource): OutboxRecord | undefined {
    const record = parseOutboxRecord(resource);
    if (record === undefined) {
      this.logger.warn({ basicId: resource.id }, 'outbox record is malformed and is skipped');
    }
    return record;
  }

  /** Publishes oldest first and stops at the first failure, so one stuck event never reorders the rest. */
  private async publishInOrder(records: readonly OutboxRecord[]): Promise<OutboxRecord[]> {
    const published: OutboxRecord[] = [];
    for (const record of records) {
      const event = this.eventOf(record);
      if (event === undefined) {
        // A malformed payload stays pending (and is reported as stuck) without blocking the events behind it.
        continue;
      }
      try {
        await this.publisher.publish(event);
      } catch (error) {
        this.logger.warn({ err: error, basicId: record.id, eventId: record.eventId, type: record.eventType }, 'event was not published; it stays pending');
        break;
      }
      published.push(record);
    }
    return published;
  }

  private eventOf(record: OutboxRecord): DomainEvent | undefined {
    try {
      const parsed: unknown = JSON.parse(record.payload);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('payload is not an object');
      }
      // The routing key and `eventId` come from the record's own extensions, never from the opaque payload.
      return { ...(parsed as Record<string, unknown>), type: record.eventType, eventId: record.eventId } as unknown as DomainEvent;
    } catch {
      this.logger.warn({ basicId: record.id, eventId: record.eventId, type: record.eventType }, 'outbox payload is not valid JSON and is skipped');
      return undefined;
    }
  }

  private async markSent(records: readonly OutboxRecord[]): Promise<void> {
    const writes: TransactionWrite[] = records.map((record) => ({
      method: 'PUT',
      url: `Basic/${record.id}`,
      resource: withOutboxStatus(record.resource, OUTBOX.SENT),
      ifMatch: record.version,
    }));
    try {
      await commitTransaction(this.fhir, writes, 'CONFLICT');
    } catch (error) {
      if (error instanceof ConflictException) {
        // Another relay marked some of them first; the events are already out, so this is a duplicate, not a loss.
        this.logger.warn({ count: records.length }, 'outbox records changed concurrently; they are re-read on the next poll');
        return;
      }
      throw error;
    }
  }

  /** Warns (id and age only, no payload) about the oldest `pending` record once it is older than the stale threshold. */
  private async warnAboutStalePending(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - this.config.stalePendingMs).toISOString();
    const result = await this.fhir.search('Basic', {
      code: CODE_SEARCH,
      _tag: tagSearch(OUTBOX.PENDING),
      _lastUpdated: `lt${cutoff}`,
      _sort: '_lastUpdated',
      _count: 1,
      _total: 'accurate',
    });
    const oldest = result.entry?.[0]?.resource;
    if (oldest !== undefined) {
      this.logger.warn(
        { pending: result.total, oldestBasicId: oldest.id, staleAfterMs: this.config.stalePendingMs },
        'outbox events are pending for too long; the broker or a payload may be stuck',
      );
    }
  }

  /** Deletes `sent` records older than the retention window, then expunges each so HAPI drops the rows. */
  private async purgeSent(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - this.config.retentionMs).toISOString();
    const result = await this.fhir.search('Basic', {
      code: CODE_SEARCH,
      _tag: tagSearch(OUTBOX.SENT),
      _lastUpdated: `lt${cutoff}`,
      _count: this.config.batchSize,
    });
    // `parseOutboxRecord` re-checks that this is an outbox record in `sent` state before anything is deleted.
    const expired = (result.entry ?? [])
      .map((entry) => parseOutboxRecord(entry.resource))
      .filter((record): record is OutboxRecord => record !== undefined && record.status === OUTBOX.SENT);
    if (expired.length === 0) {
      return;
    }
    await commitTransaction(
      this.fhir,
      expired.map((record) => ({ method: 'DELETE', url: `Basic/${record.id}` })),
      'CONFLICT',
    );
    for (const record of expired) {
      try {
        await this.fhir.operation(
          'Basic',
          '$expunge',
          { limit: 1, expungeDeletedResources: true, expungePreviousVersions: true },
          { method: 'POST', id: record.id },
        );
      } catch (error) {
        this.logger.warn({ err: error, basicId: record.id }, 'expunge failed; the record is deleted but its rows remain');
      }
    }
    this.logger.log({ count: expired.length }, 'expired outbox records were deleted and expunged');
  }
}
