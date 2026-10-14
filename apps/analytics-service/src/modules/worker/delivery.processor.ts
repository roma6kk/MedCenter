import { Injectable, Logger } from '@nestjs/common';

import { parseAnalyticsEvent } from './analytics-event';
import { IngestionService } from './ingestion.service';

/**
 * - `ack`: committed (or a known duplicate) — remove from the queue.
 * - `retry`: transient failure — re-publish to `<queue>.retry` (5 s delay) and ack.
 * - `dead-letter`: malformed, or the attempt budget is spent — `nack` to `<queue>.dlq`.
 */
export type Disposition = 'ack' | 'retry' | 'dead-letter';

/** Header the worker stamps on a re-published delivery. */
export const ATTEMPT_HEADER = 'x-analytics-attempt';

/** First delivery plus four delayed retries (~20 s), then the DLQ. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** Attempt number of a delivery, from the header the worker stamped (1 when absent or invalid). */
export function attemptOf(headers: Readonly<Record<string, unknown>> | undefined): number {
  const value = headers?.[ATTEMPT_HEADER];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

/**
 * Decides the fate of one broker delivery. Acking happens only after the
 * read-model transaction committed, so a crash in between redelivers the
 * message and the `eventId` ledger absorbs the duplicate.
 */
@Injectable()
export class DeliveryProcessor {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(private readonly ingestion: IngestionService) {}

  async process(content: Buffer, attempt: number): Promise<Disposition> {
    const event = parseAnalyticsEvent(content);
    if (event === undefined) {
      this.logger.error({ bytes: content.length }, 'malformed analytics event; dead-lettering');
      return 'dead-letter';
    }
    try {
      const outcome = await this.ingestion.ingest(event, { isLastAttempt: attempt >= MAX_DELIVERY_ATTEMPTS });
      this.logger.debug({ type: event.type, eventId: event.eventId, outcome }, 'analytics event ingested');
      return 'ack';
    } catch (error) {
      const context = { err: error, type: event.type, eventId: event.eventId, attempt };
      if (attempt < MAX_DELIVERY_ATTEMPTS) {
        this.logger.warn(context, 'analytics ingestion failed; retrying after a delay');
        return 'retry';
      }
      this.logger.error(context, 'analytics ingestion failed on the last attempt; dead-lettering');
      return 'dead-letter';
    }
  }
}
