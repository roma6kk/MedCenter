import type { AnalyticsEvent } from './analytics-event';

interface AnalyticsBinding {
  readonly queue: string;
  readonly routingKey: AnalyticsEvent['type'];
}

export const ANALYTICS_BINDINGS: ReadonlyArray<AnalyticsBinding> = [
  { queue: 'analytics.appointment-booked', routingKey: 'appointment.booked.v1' },
  { queue: 'analytics.appointment-cancelled', routingKey: 'appointment.cancelled.v1' },
  { queue: 'analytics.encounter-completed', routingKey: 'encounter.completed.v1' },
];
