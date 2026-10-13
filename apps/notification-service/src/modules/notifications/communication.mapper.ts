import { createHash } from 'node:crypto';

import type { FhirResource } from '@medcenter/fhir';
import type { DomainEvent } from '@medcenter/messaging';

/**
 * Domain event → FHIR `Communication` (FR-008). Returns `undefined` for event
 * types this service does not notify on, so the consumer can acknowledge them.
 *
 * The text is built only from the fields needed for the message. In particular
 * `patient.registered.v1` carries an email, which must never reach the clinical
 * store, so it is not read here.
 */
export function communicationFromEvent(event: DomainEvent): FhirResource | undefined {
  const recipient = recipientOf(event);
  const built = describe(event);
  if (recipient === undefined || built === undefined) {
    return undefined;
  }
  return {
    resourceType: 'Communication',
    id: communicationIdFor(event.eventId),
    status: 'in-progress',
    category: [{ text: built.category }],
    recipient: [{ reference: recipient }],
    sent: event.occurredAt,
    payload: [{ contentString: built.text }],
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

function recipientOf(event: DomainEvent): string | undefined {
  switch (event.type) {
    case 'appointment.booked.v1':
    case 'appointment.cancelled.v1':
    case 'encounter.completed.v1':
      return stringField(event, 'patientRef');
    case 'patient.registered.v1': {
      const patientId = stringField(event, 'patientId');
      return patientId === undefined ? undefined : `Patient/${patientId}`;
    }
    default:
      return undefined;
  }
}

function describe(event: DomainEvent): { category: string; text: string } | undefined {
  switch (event.type) {
    case 'appointment.booked.v1':
      return {
        category: 'appointment',
        text: `Вы записаны на приём. Начало: ${stringField(event, 'start') ?? ''}`,
      };
    case 'appointment.cancelled.v1':
      return {
        category: 'appointment',
        text: `Запись на приём отменена. Причина: ${stringField(event, 'reason') ?? ''}`,
      };
    case 'encounter.completed.v1':
      return { category: 'encounter', text: 'Приём завершён. Результаты доступны в медицинской карте.' };
    case 'patient.registered.v1':
      return { category: 'registration', text: 'Регистрация в медицинском центре завершена.' };
    default:
      return undefined;
  }
}

function stringField(event: DomainEvent, key: string): string | undefined {
  const value = (event as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
