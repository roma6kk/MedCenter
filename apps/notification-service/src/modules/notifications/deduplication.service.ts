import { Inject, Injectable } from '@nestjs/common';

/**
 * `claimed`: this caller now owns the event and must write it.
 * `in-progress`: another delivery holds the lease and is still writing.
 * `done`: the event was fully handled earlier.
 */
export type ClaimState = 'claimed' | 'in-progress' | 'done';

/** Redis in production (`SET key ... NX EX`), a Map in unit tests. */
export interface DedupStore {
  /**
   * Atomically takes the key as `in-progress` if it is absent, with a lease of
   * `leaseSeconds`. Otherwise reports the state the key already has.
   */
  claim(key: string, leaseSeconds: number): Promise<ClaimState>;
  /** Marks the key `done`, kept for `ttlSeconds` so broker redeliveries are recognised. */
  complete(key: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export const DEDUP_STORE = Symbol('DEDUP_STORE');

/** Dedup window for `eventId` (architect §4.4): long enough to outlive any broker redelivery. */
export const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Lease on an in-progress claim. If the process dies mid-write the lease expires
 * and a redelivery can take the event over; a long-lived lease would requeue the
 * redelivery for the whole dedup window.
 */
export const IN_PROGRESS_LEASE_SECONDS = 60;

/** Thrown when a redelivery arrives while the first copy is still being written. */
export class EventInProgressError extends Error {
  constructor(eventId: string) {
    super(`event ${eventId} is still being written by another delivery`);
    this.name = 'EventInProgressError';
  }
}

/**
 * RabbitMQ is at-least-once, so a duplicate `eventId` is expected. `claim`
 * marks an event as in progress before the FHIR write; `complete` marks it done
 * after the write; `release` undoes the claim when the write fails, so the
 * redelivered message is processed again instead of being silently dropped.
 */
@Injectable()
export class DeduplicationService {
  constructor(@Inject(DEDUP_STORE) private readonly store: DedupStore) {}

  claim(eventId: string): Promise<ClaimState> {
    return this.store.claim(this.keyOf(eventId), IN_PROGRESS_LEASE_SECONDS);
  }

  complete(eventId: string): Promise<void> {
    return this.store.complete(this.keyOf(eventId), DEDUP_TTL_SECONDS);
  }

  release(eventId: string): Promise<void> {
    return this.store.delete(this.keyOf(eventId));
  }

  private keyOf(eventId: string): string {
    return `notification:event:${eventId}`;
  }
}
