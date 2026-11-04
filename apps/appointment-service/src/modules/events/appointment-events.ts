import { randomUUID } from 'node:crypto';
import type { AppointmentBookedEvent, AppointmentCancelledEvent, AppointmentNoShowEvent } from '@medcenter/contracts';

type BookedPayload = Omit<AppointmentBookedEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;
type CancelledPayload = Omit<AppointmentCancelledEvent, 'v' | 'eventId' | 'occurredAt' | 'type' | 'reason'>;
type NoShowPayload = Omit<AppointmentNoShowEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;

/**
 * The `appointment.*.v1` envelopes. They are not published here: the service
 * records them as outbox entries in the same FHIR transaction as the booking or
 * cancellation, and `outbox-relay` publishes them (ADR-021). Each gets a fresh
 * `eventId`, the consumers' dedup key.
 */
export function bookedEvent(payload: BookedPayload): AppointmentBookedEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'appointment.booked.v1' };
}

/** No `reason`: the free text is health data and stays in `Appointment.cancelationReason` (ADR-021). */
export function cancelledEvent(payload: CancelledPayload): AppointmentCancelledEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'appointment.cancelled.v1' };
}

/** The doctor's no-show record (BR-008): the ids only, like the cancellation (ADR-021). */
export function noshowEvent(payload: NoShowPayload): AppointmentNoShowEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'appointment.noshow.v1' };
}
