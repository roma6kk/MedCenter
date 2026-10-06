import type { DomainEventBase } from './domain-event-base';
import { DLQ_SUFFIX, DOMAIN_EVENT_EXCHANGE } from './domain-event.constants';
import type { AppointmentBookedEvent } from './appointment-booked.event';
import type { AppointmentCancelledEvent } from './appointment-cancelled.event';
import type { EncounterCompletedEvent } from './encounter-completed.event';
import type { PatientRegisteredEvent } from './patient-registered.event';

const BASE: DomainEventBase = {
  v: 1,
  eventId: 'evt-1',
  occurredAt: '2026-10-05T00:00:00.000Z',
};

const bookdEvent: AppointmentBookedEvent = {
  ...BASE,
  type: 'appointment.booked.v1',
  appointmentId: 'appt-1',
  patientRef: 'Patient/1',
  practitionerRoleRef: 'PractitionerRole/9',
  slotRef: 'Slot/3',
  start: '2026-10-06T07:00:00.000Z',
  serviceId: 'svc-1',
};

const cancelledEvent: AppointmentCancelledEvent = {
  ...BASE,
  type: 'appointment.cancelled.v1',
  appointmentId: 'appt-1',
  patientRef: 'Patient/1',
  reason: 'Пациент заболел',
  actorType: 'PATIENT',
};

const registeredEvent: PatientRegisteredEvent = {
  ...BASE,
  type: 'patient.registered.v1',
  patientId: 'Patient/1',
  email: 'patient@example.by',
};

const completedEvent: EncounterCompletedEvent = {
  ...BASE,
  type: 'encounter.completed.v1',
  encounterId: 'enc-1',
  patientRef: 'Patient/1',
  practitionerRef: 'Practitioner/2',
  diagnoses: [{ code: 'J06.9', display: 'Острая респираторная инфекция' }],
};

describe('domain event contracts', () => {
  it('should route every event through the medical.events exchange', () => {
    expect(DOMAIN_EVENT_EXCHANGE).toBe('medical.events');
  });

  it('should suffix the dead-letter queue with .dlq', () => {
    expect(DLQ_SUFFIX).toBe('.dlq');
  });

  it('should pin schema version 1 on every published event', () => {
    const events = [bookdEvent, cancelledEvent, registeredEvent, completedEvent];

    expect(events.every((event) => event.v === 1)).toBe(true);
  });

  it.each([
    ['appointment.booked.v1', bookdEvent.type],
    ['appointment.cancelled.v1', cancelledEvent.type],
    ['patient.registered.v1', registeredEvent.type],
    ['encounter.completed.v1', completedEvent.type],
  ])('should route the stable key %s', (expected, actual) => {
    expect(actual).toBe(expected);
  });

  it('should keep every event routing key unique', () => {
    const types = [bookdEvent.type, cancelledEvent.type, registeredEvent.type, completedEvent.type];

    expect(new Set(types).size).toBe(types.length);
  });

  it('should express every routing key as <domain>.<event>.v<version>', () => {
    const types = [bookdEvent.type, cancelledEvent.type, registeredEvent.type, completedEvent.type];

    expect(types.every((type) => /^[a-z]+\.[a-z.]+\.v\d+$/.test(type))).toBe(true);
  });
});
