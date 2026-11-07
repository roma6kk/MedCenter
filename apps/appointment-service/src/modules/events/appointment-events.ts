import { randomUUID } from 'node:crypto';
import type { AppointmentBookedEvent, AppointmentCancelledEvent, AppointmentNoShowEvent } from '@medcenter/contracts';

type BookedPayload = Omit<AppointmentBookedEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;
type CancelledPayload = Omit<AppointmentCancelledEvent, 'v' | 'eventId' | 'occurredAt' | 'type' | 'reason'>;
type NoShowPayload = Omit<AppointmentNoShowEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;

function envelope(): { readonly v: 1; readonly eventId: string; readonly occurredAt: string } {
  return { v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString() };
}

export function bookedEvent(payload: BookedPayload): AppointmentBookedEvent {
  return { ...payload, ...envelope(), type: 'appointment.booked.v1' };
}

export function cancelledEvent(payload: CancelledPayload): AppointmentCancelledEvent {
  return { ...payload, ...envelope(), type: 'appointment.cancelled.v1' };
}

export function noshowEvent(payload: NoShowPayload): AppointmentNoShowEvent {
  return { ...payload, ...envelope(), type: 'appointment.noshow.v1' };
}
