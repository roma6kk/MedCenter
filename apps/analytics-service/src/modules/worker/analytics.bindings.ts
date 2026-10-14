import type { AnalyticsEvent } from './analytics-event';

export interface AnalyticsBinding {
  readonly queue: string;
  readonly routingKey: AnalyticsEvent['type'];
}

/**
 * Own queues on the `medical.events` exchange (architect §4.4): analytics
 * never shares a queue with notification-service, so each consumer sees every
 * event. Each queue gets `<queue>.dlq` and `<queue>.retry` (`bindQueueWithDlq`).
 */
export const ANALYTICS_BINDINGS: ReadonlyArray<AnalyticsBinding> = [
  { queue: 'analytics.appointment-booked', routingKey: 'appointment.booked.v1' },
  { queue: 'analytics.appointment-cancelled', routingKey: 'appointment.cancelled.v1' },
  { queue: 'analytics.encounter-completed', routingKey: 'encounter.completed.v1' },
];
