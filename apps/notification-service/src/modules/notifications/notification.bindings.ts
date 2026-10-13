/**
 * Queue → routing-key bindings on the `medical.events` exchange (architect §4.4).
 * Each queue gets a `<queue>.dlq` dead-letter queue (see `bindQueueWithDlq`).
 */
export const NOTIFICATION_BINDINGS: ReadonlyArray<{ readonly queue: string; readonly routingKey: string }> = [
  { queue: 'notification.appointment-booked', routingKey: 'appointment.booked.v1' },
  { queue: 'notification.appointment-cancelled', routingKey: 'appointment.cancelled.v1' },
  { queue: 'notification.encounter-completed', routingKey: 'encounter.completed.v1' },
  { queue: 'notification.patient-registered', routingKey: 'patient.registered.v1' },
];
