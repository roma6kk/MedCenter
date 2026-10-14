import type {
  AppointmentBookedEvent,
  AppointmentCancelledEvent,
  EncounterCompletedEvent,
} from '@medcenter/contracts';

/** The three domain events the analytics worker consumes (architect §4.4). */
export type AnalyticsEvent = AppointmentBookedEvent | AppointmentCancelledEvent | EncounterCompletedEvent;

type Json = Readonly<Record<string, unknown>>;

/** Column widths of the read-model (migration `AnalyticsInit`). */
const REF_MAX = 128;
const EVENT_ID_MAX = 128;

/** FHIR `id`: `[A-Za-z0-9\-.]{1,64}`. Ids go into `_id=` searches, so a comma or space must never get through. */
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isFhirId(value: unknown): value is string {
  return typeof value === 'string' && FHIR_ID.test(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasEnvelope(event: Json): boolean {
  return event['v'] === 1 && isText(event['eventId'], EVENT_ID_MAX) && isInstant(event['occurredAt']);
}

function isBooked(event: Json): boolean {
  return (
    isFhirId(event['appointmentId']) &&
    isText(event['patientRef'], REF_MAX) &&
    isText(event['practitionerRoleRef'], REF_MAX) &&
    isText(event['slotRef'], REF_MAX) &&
    isFhirId(event['serviceId']) &&
    isInstant(event['start'])
  );
}

function isCancelled(event: Json): boolean {
  return (
    isFhirId(event['appointmentId']) &&
    isText(event['patientRef'], REF_MAX) &&
    typeof event['reason'] === 'string' &&
    (event['actorType'] === 'PATIENT' || event['actorType'] === 'ADMIN')
  );
}

function isCompleted(event: Json): boolean {
  return (
    isFhirId(event['encounterId']) &&
    isText(event['patientRef'], REF_MAX) &&
    isText(event['practitionerRef'], REF_MAX) &&
    Array.isArray(event['diagnoses'])
  );
}

const PAYLOAD_CHECKS: Readonly<Record<AnalyticsEvent['type'], (event: Json) => boolean>> = {
  'appointment.booked.v1': isBooked,
  'appointment.cancelled.v1': isCancelled,
  'encounter.completed.v1': isCompleted,
};

function isAnalyticsType(value: unknown): value is AnalyticsEvent['type'] {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAYLOAD_CHECKS, value);
}

function parseJson(content: Buffer): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(content.toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Json) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Boundary validation of a broker delivery (AGENTS.md: validate external
 * input). Anything that does not match the `libs/contracts` event shape —
 * or would not fit the read-model columns — is `undefined` and goes to the DLQ.
 */
export function parseAnalyticsEvent(content: Buffer): AnalyticsEvent | undefined {
  const event = parseJson(content);
  const type = event?.['type'];
  if (event === undefined || !isAnalyticsType(type) || !hasEnvelope(event)) {
    return undefined;
  }
  return PAYLOAD_CHECKS[type](event) ? (event as unknown as AnalyticsEvent) : undefined;
}
