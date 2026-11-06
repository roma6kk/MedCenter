import { createHash } from 'node:crypto';

import { formatClinicDateTime } from '@medcenter/common';
import type { FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import type { NotificationEvent } from './notification-event';
import { NOTIFICATION_KIND_SYSTEM, type NotificationKind } from './notification-kind';

/** Text is built only from the fields the message needs: legacy event emails and encounter diagnoses must never reach the clinical store. */
export function communicationFromEvent(event: NotificationEvent): FhirResource {
  const built = describe(event);
  return {
    resourceType: 'Communication',
    id: communicationIdFor(event.eventId),
    status: 'in-progress',
    category: [{ text: built.category }],
    topic: { coding: [{ system: NOTIFICATION_KIND_SYSTEM, code: built.kind }] },
    recipient: [{ reference: recipientOf(event) }],
    sent: event.occurredAt,
    payload: [{ contentString: built.text }],
    ...(built.about === undefined ? {} : { about: [{ reference: built.about }] }),
    ...(built.start === undefined ? {} : { extension: [{ url: MEDCENTER_EXT.NOTIFICATION_APPOINTMENT_START, valueDateTime: built.start }] }),
  };
}

/** Deterministic id: a redelivered event rewrites the same resource even when the dedup key is gone. */
export function communicationIdFor(eventId: string): string {
  const hex = createHash('sha256').update(eventId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function recipientOf(event: NotificationEvent): string {
  return event.type === 'patient.registered.v1' ? `Patient/${event.patientId}` : event.patientRef;
}

interface Described {
  readonly category: string;
  readonly kind: NotificationKind;
  readonly text: string;
  readonly about?: string;
  readonly start?: string;
}

function startText(start: string): string {
  return formatClinicDateTime(start) ?? start;
}

function startInstant(start: string): string | undefined {
  const epochMs = Date.parse(start);
  return Number.isNaN(epochMs) ? undefined : new Date(epochMs).toISOString();
}

function describe(event: NotificationEvent): Described {
  switch (event.type) {
    case 'appointment.booked.v1':
      return {
        category: 'appointment',
        kind: 'appointment.booked',
        text: `Вы записаны на приём. Начало: ${startText(event.start)} (время Минска)`,
        about: `Appointment/${event.appointmentId}`,
        start: startInstant(event.start),
      };
    case 'appointment.cancelled.v1':
      return {
        category: 'appointment',
        kind: event.actorType === 'ADMIN' ? 'appointment.cancelled.by-admin' : 'appointment.cancelled',
        // The free-text reason is health data: it is neither carried by the event nor copied into the message (ADR-021).
        text:
          event.actorType === 'ADMIN'
            ? 'Клиника отменила вашу запись на приём. Выберите другое время в разделе «Записаться».'
            : 'Запись на приём отменена.',
        about: `Appointment/${event.appointmentId}`,
      };
    case 'appointment.noshow.v1':
      return {
        category: 'appointment',
        kind: 'appointment.noshow',
        text: 'Приём отмечен как несостоявшийся: врач зафиксировал неявку.',
        about: `Appointment/${event.appointmentId}`,
      };
    case 'encounter.completed.v1':
      return {
        category: 'encounter',
        kind: 'encounter.completed',
        text: 'Приём завершён. Результаты доступны в медицинской карте.',
        about: `Encounter/${event.encounterId}`,
      };
    case 'patient.registered.v1':
      return { category: 'registration', kind: 'patient.registered', text: 'Регистрация в медицинском центре завершена.' };
  }
}
