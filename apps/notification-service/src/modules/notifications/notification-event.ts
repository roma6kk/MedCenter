import type {
  AppointmentBookedEvent,
  AppointmentCancelledEvent,
  AppointmentNoShowEvent,
  EncounterCompletedEvent,
  PatientRegisteredEvent,
} from '@medcenter/contracts';
import type { DomainEvent } from '@medcenter/messaging';

/** The events this service notifies on (architect §4.4); `NOTIFICATION_BINDINGS` binds one queue to each. */
export type NotificationEvent =
  | AppointmentBookedEvent
  | AppointmentCancelledEvent
  | AppointmentNoShowEvent
  | EncounterCompletedEvent
  | PatientRegisteredEvent;

/**
 * A known event type whose envelope or payload fails the boundary check. A retry cannot fix the payload, so the
 * consumer dead-letters it at once. Names the field, never its value: the payload is not logged.
 */
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

/** FHIR `id`: `[A-Za-z0-9\-.]{1,64}`. Ids end up in `Communication.about`, so no separator or space may get through. */
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;
const PATIENT_REFERENCE = /^Patient\/[A-Za-z0-9\-.]{1,64}$/;
const EVENT_ID_MAX = 128;

const isFhirId: Check = (value) => typeof value === 'string' && FHIR_ID.test(value);
/** `Patient/{id}`: it becomes `Communication.recipient`, so a bare id or another resource type must not pass. */
const isPatientReference: Check = (value) => typeof value === 'string' && PATIENT_REFERENCE.test(value);
const isInstant: Check = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isActorType: Check = (value) => value === 'PATIENT' || value === 'ADMIN';

const ENVELOPE: Readonly<Record<string, Check>> = {
  v: (value) => value === 1,
  eventId: (value) => typeof value === 'string' && value.length > 0 && value.length <= EVENT_ID_MAX,
  occurredAt: isInstant,
};

/**
 * The fields the notification reads, per event type. Optional fields that older events still carry (`reason`,
 * `diagnoses`, `email`) are neither checked nor read (ADR-021).
 */
const PAYLOAD: Readonly<Record<NotificationEvent['type'], Readonly<Record<string, Check>>>> = {
  'appointment.booked.v1': { appointmentId: isFhirId, patientRef: isPatientReference, start: isInstant },
  'appointment.cancelled.v1': { appointmentId: isFhirId, patientRef: isPatientReference, actorType: isActorType },
  'appointment.noshow.v1': { appointmentId: isFhirId, patientRef: isPatientReference },
  'encounter.completed.v1': { encounterId: isFhirId, patientRef: isPatientReference },
  // The only event that names the patient by a bare id (auth-service); the mapper adds the `Patient/` prefix.
  'patient.registered.v1': { patientId: isFhirId },
};

function isNotificationType(type: string): type is NotificationEvent['type'] {
  return Object.prototype.hasOwnProperty.call(PAYLOAD, type);
}

/** The first field of `checks` that `event` does not satisfy. */
function invalidField(event: Fields, checks: Readonly<Record<string, Check>>): string | undefined {
  return Object.keys(checks).find((field) => checks[field]?.(event[field]) !== true);
}

/**
 * Boundary validation of a broker delivery (AGENTS.md: validate external input), as analytics-service does for
 * its events. `undefined` for a type this service does not notify on; the consumer acknowledges it. A known type
 * whose envelope or payload is wrong throws {@link InvalidEventError}, which the consumer dead-letters.
 */
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
