import type { AppointmentBookedEvent, AppointmentCancelledEvent, EncounterCompletedEvent } from '@medcenter/contracts';

import { diagnosisCountOf, parseAnalyticsEvent } from './analytics-event';

const BOOKED: AppointmentBookedEvent = {
  v: 1,
  type: 'appointment.booked.v1',
  eventId: 'evt-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
};

const CANCELLED: AppointmentCancelledEvent = {
  v: 1,
  type: 'appointment.cancelled.v1',
  eventId: 'evt-2',
  occurredAt: '2026-10-09T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  reason: 'Пациент заболел',
  actorType: 'PATIENT',
};

const COMPLETED: EncounterCompletedEvent = {
  v: 1,
  type: 'encounter.completed.v1',
  eventId: 'evt-3',
  occurredAt: '2026-11-02T09:40:00.000Z',
  encounterId: 'enc-1',
  patientRef: 'Patient/pat-1',
  practitionerRef: 'PractitionerRole/role-1',
  diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей' }],
};

function bytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

describe('parseAnalyticsEvent', () => {
  it.each([
    ['appointment.booked.v1', BOOKED],
    ['appointment.cancelled.v1', CANCELLED],
    ['encounter.completed.v1', COMPLETED],
  ])('should accept a well-formed %s when every contract field is present', (_type, event) => {
    expect(parseAnalyticsEvent(bytes(event))).toEqual(event);
  });

  it('should accept a cancellation without a reason when the producer no longer sends one (ADR-021)', () => {
    const withoutReason: Record<string, unknown> = { ...CANCELLED };
    delete withoutReason['reason'];

    expect(parseAnalyticsEvent(bytes(withoutReason))).toEqual(withoutReason);
  });

  it('should reject a cancellation whose reason is not text when a producer misbehaves', () => {
    expect(parseAnalyticsEvent(bytes({ ...CANCELLED, reason: 5 }))).toBeUndefined();
  });

  it('should reject a body that is not JSON when the broker delivers garbage', () => {
    expect(parseAnalyticsEvent(Buffer.from('{not json'))).toBeUndefined();
  });

  it('should reject an event type the worker does not consume when it is routed here by mistake', () => {
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, type: 'patient.registered.v1' }))).toBeUndefined();
  });

  it('should reject an event without an eventId when deduplication would be impossible', () => {
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, eventId: '' }))).toBeUndefined();
  });

  it('should reject an unparseable occurredAt or start when the period dimension would be lost', () => {
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, occurredAt: 'yesterday' }))).toBeUndefined();
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, start: 'soon' }))).toBeUndefined();
  });

  it('should reject an identifier longer than its read-model column when a producer misbehaves', () => {
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, appointmentId: 'a'.repeat(65) }))).toBeUndefined();
  });

  it.each([
    ['appointmentId', BOOKED],
    ['serviceId', BOOKED],
    ['appointmentId', CANCELLED],
    ['encounterId', COMPLETED],
  ])('should reject an event when %s is not a FHIR id (it would break a _id= search)', (field, event) => {
    expect(parseAnalyticsEvent(bytes({ ...event, [field]: 'svc-1,svc-2' }))).toBeUndefined();
    expect(parseAnalyticsEvent(bytes({ ...event, [field]: 'id with space' }))).toBeUndefined();
    expect(parseAnalyticsEvent(bytes({ ...event, [field]: 'a/b' }))).toBeUndefined();
  });

  it('should accept the id alphabet of FHIR when ids carry dots, dashes and digits', () => {
    const event = { ...BOOKED, appointmentId: '12.34-ab', serviceId: '9f8c1d2e-0000-4000-8000-000000000001' };

    expect(parseAnalyticsEvent(bytes(event))).toEqual(event);
  });

  it('should reject an unknown cancellation actor when actorType is outside the contract', () => {
    expect(parseAnalyticsEvent(bytes({ ...CANCELLED, actorType: 'DOCTOR' }))).toBeUndefined();
  });

  it('should reject a completed encounter when its diagnoses are not a list', () => {
    expect(parseAnalyticsEvent(bytes({ ...COMPLETED, diagnoses: 'J06.9' }))).toBeUndefined();
  });

  it('should accept a completed encounter with a diagnosisCount and no diagnoses when the payload is minimised', () => {
    const { diagnoses: _dropped, ...rest } = COMPLETED;
    const minimised = { ...rest, diagnosisCount: 2 };

    expect(parseAnalyticsEvent(bytes(minimised))).toEqual(minimised);
  });

  it('should reject a completed encounter when it carries neither diagnosisCount nor diagnoses', () => {
    const { diagnoses: _dropped, ...rest } = COMPLETED;

    expect(parseAnalyticsEvent(bytes(rest))).toBeUndefined();
  });

  it.each([-1, 1.5, '2', null])('should reject a completed encounter when diagnosisCount is %p', (count) => {
    expect(parseAnalyticsEvent(bytes({ ...COMPLETED, diagnosisCount: count }))).toBeUndefined();
  });

  it('should prefer diagnosisCount over the length of the legacy list', () => {
    expect(diagnosisCountOf({ ...COMPLETED, diagnosisCount: 3 })).toBe(3);
    expect(diagnosisCountOf(COMPLETED)).toBe(1);
  });

  it('should reject an unsupported schema version when v is not 1', () => {
    expect(parseAnalyticsEvent(bytes({ ...BOOKED, v: 2 }))).toBeUndefined();
  });
});
