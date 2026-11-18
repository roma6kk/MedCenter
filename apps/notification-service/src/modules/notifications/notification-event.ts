import type {
  AppointmentBookedEvent,
  AppointmentCancelledEvent,
  AppointmentNoShowEvent,
  EncounterCompletedEvent,
  PatientRegisteredEvent,
} from '@medcenter/contracts';
import type { DomainEvent } from '@medcenter/messaging';

export type NotificationEvent =
  | AppointmentBookedEvent
  | AppointmentCancelledEvent
  | AppointmentNoShowEvent
  | EncounterCompletedEvent
  | PatientRegisteredEvent;

/** Names the field, never its value: the payload is not logged. A retry cannot fix it, so it is dead-lettered at once. */
export class InvalidEventError extends Error {
  constructor(
    readonly eventType: string,
    readonly field: string,
  ) {
    super(`${eventType} has an invalid ${field}`);
    this.name = 'InvalidEventError';
  }
}

type Check = (value: unknown) => boolean;
type Fields = Readonly<Record<string, unknown>>;

/** FHIR `id`: ids end up in `Communication.about`, so no separator or space may get through. */
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;
const PATIENT_REFERENCE = /^Patient\/[A-Za-z0-9\-.]{1,64}$/;
const EVENT_ID_MAX = 128;

const isFhirId: Check = (value) => typeof value === 'string' && FHIR_ID.test(value);
/** `Patient/{id}` becomes `Communication.recipient`: a bare id or another resource type must not pass. */
const isPatientReference: Check = (value) => typeof value === 'string' && PATIENT_REFERENCE.test(value);
const isInstant: Check = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isActorType: Check = (value) => value === 'PATIENT' || value === 'ADMIN';

const ENVELOPE: Readonly<Record<string, Check>> = {
  v: (value) => value === 1,
  eventId: (value) => typeof value === 'string' && value.length > 0 && value.length <= EVENT_ID_MAX,
  occurredAt: isInstant,
};

const PAYLOAD: Readonly<Record<NotificationEvent['type'], Readonly<Record<string, Check>>>> = {
  'appointment.booked.v1': { appointmentId: isFhirId, patientRef: isPatientReference, start: isInstant },
  'appointment.cancelled.v1': { appointmentId: isFhirId, patientRef: isPatientReference, actorType: isActorType },
  'appointment.noshow.v1': { appointmentId: isFhirId, patientRef: isPatientReference },
  'encounter.completed.v1': { encounterId: isFhirId, patientRef: isPatientReference },
  // The only event naming the patient by a bare id (auth-service); the mapper adds `Patient/`.
  'patient.registered.v1': { patientId: isFhirId },
};

function isNotificationType(type: string): type is NotificationEvent['type'] {
  return Object.prototype.hasOwnProperty.call(PAYLOAD, type);
}

function invalidField(event: Fields, checks: Readonly<Record<string, Check>>): string | undefined {
  return Object.keys(checks).find((field) => checks[field]?.(event[field]) !== true);
}

export function parseNotificationEvent(event: DomainEvent): NotificationEvent | undefined {
  if (!isNotificationType(event.type)) {
    return undefined;
  }
  const fields = event as unknown as Fields;
  const invalid = invalidField(fields, ENVELOPE) ?? invalidField(fields, PAYLOAD[event.type]);
  if (invalid !== undefined) {
    throw new InvalidEventError(event.type, invalid);
  }
  return event as unknown as NotificationEvent;
}
