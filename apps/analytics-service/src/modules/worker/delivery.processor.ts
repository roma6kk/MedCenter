import { Injectable, Logger } from '@nestjs/common';
import { attemptOf as attemptOfDelivery } from '@medcenter/messaging';

import { parseAnalyticsEvent } from './analytics-event';
import { IngestionService } from './ingestion.service';

export type Disposition = 'ack' | 'retry' | 'dead-letter';

export const ATTEMPT_HEADER = 'x-analytics-attempt';

export const MAX_DELIVERY_ATTEMPTS = 5;

export function attemptOf(headers: Readonly<Record<string, unknown>> | undefined): number {
  return attemptOfDelivery(headers, ATTEMPT_HEADER);
}

// Acked only after the read-model transaction committed: a crash in between redelivers and the eventId ledger absorbs the duplicate.
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
