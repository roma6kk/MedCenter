import { Column, Entity, PrimaryColumn } from 'typeorm';

import { ANALYTICS_SCHEMA } from '../analytics-schema';

/**
 * Idempotency ledger of the worker (architect §4.4: dedup by `eventId`). The
 * primary key is the event id: a redelivered event conflicts on insert and is
 * acknowledged without touching the facts again.
 */
@Entity({ name: 'processed_event', schema: ANALYTICS_SCHEMA })
export class ProcessedEventEntity {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 128 })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
