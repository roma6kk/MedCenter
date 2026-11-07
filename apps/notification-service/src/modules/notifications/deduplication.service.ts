import { Inject, Injectable } from '@nestjs/common';

export type ClaimState = 'claimed' | 'in-progress' | 'done';

export interface DedupStore {
  claim(key: string, leaseSeconds: number): Promise<ClaimState>;
  complete(key: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export const DEDUP_STORE = Symbol('DEDUP_STORE');

export const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Lease on an in-progress claim: a crashed write is taken over after it expires, not after the whole dedup window. */
export const IN_PROGRESS_LEASE_SECONDS = 60;

export class EventInProgressError extends Error {
  constructor(eventId: string) {
    super(`event ${eventId} is still being written by another delivery`);
    this.name = 'EventInProgressError';
  }
}

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
