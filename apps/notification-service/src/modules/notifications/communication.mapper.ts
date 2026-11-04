import { createHash } from 'node:crypto';

import type { FhirResource } from '@medcenter/fhir';

import { formatClinicDateTime } from './clinic-time';
import type { NotificationEvent } from './notification-event';

/**
 * Domain event → FHIR `Communication` (FR-008). The event has passed `parseNotificationEvent`, so every field read
 * here is there. It is typed over the contract interfaces: a renamed contract field fails compilation instead of
 * making every notification of that type silently disappear.
 *
 * The text is built only from the fields needed for the message. In particular
 * older `patient.registered.v1` events carry an email (no longer sent, ADR-021),
 * which must never reach the clinical store, so it is not read here; nor are the
 * diagnoses of `encounter.completed.v1`.
 */
export function communicationFromEvent(event: NotificationEvent): FhirResource {
  const built = describe(event);
  return {
    resourceType: 'Communication',
    id: communicationIdFor(event.eventId),
    status: 'in-progress',
    category: [{ text: built.category }],
    recipient: [{ reference: recipientOf(event) }],
    sent: event.occurredAt,
    payload: [{ contentString: built.text }],
    ...(built.about === undefined ? {} : { about: [{ reference: built.about }] }),
  };
}

/**
 * Deterministic `Communication` id for an event: a redelivered event targets the
 * same resource, so the write is idempotent even when the dedup key is gone.
 * UUID-shaped SHA-256 digest, which HAPI accepts as a client-assigned id.
 */
export function communicationIdFor(eventId: string): string {
  const hex = createHash('sha256').update(eventId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function recipientOf(event: NotificationEvent): string {
  return event.type === 'patient.registered.v1' ? `Patient/${event.patientId}` : event.patientRef;
}

interface Described {
  readonly category: string;
  readonly text: string;
  /** `Communication.about`: the appointment or encounter the notification is about, so a client can link to it. */
  readonly about?: string;
}

/** The start in clinic (Minsk) time, as the patient booked it; the raw value only when it is no instant. */
function startText(start: string): string {
  return formatClinicDateTime(start) ?? start;
}

function describe(event: NotificationEvent): Described {
  switch (event.type) {
    case 'appointment.booked.v1':
      return {
        category: 'appointment',
        text: `Вы записаны на приём. Начало: ${startText(event.start)} (время Минска)`,
        about: `Appointment/${event.appointmentId}`,
      };
    case 'appointment.cancelled.v1':
      return {
        category: 'appointment',
        // The free-text reason is health data: it is neither carried by the event nor copied into the message (ADR-021).
        // A cancellation by the clinic (BR-002) says so: the patient did not cancel it and has to pick another time.
        text:
          event.actorType === 'ADMIN'
            ? 'Клиника отменила вашу запись на приём. Выберите другое время в разделе «Записаться».'
            : 'Запись на приём отменена.',
        about: `Appointment/${event.appointmentId}`,
      };
    case 'appointment.noshow.v1':
      return {
        category: 'appointment',
        text: 'Приём отмечен как несостоявшийся: врач зафиксировал неявку.',
        about: `Appointment/${event.appointmentId}`,
      };
    case 'encounter.completed.v1':
      return {
        category: 'encounter',
        text: 'Приём завершён. Результаты доступны в медицинской карте.',
        about: `Encounter/${event.encounterId}`,
      };
    case 'patient.registered.v1':
      return { category: 'registration', text: 'Регистрация в медицинском центре завершена.' };
  }
}
