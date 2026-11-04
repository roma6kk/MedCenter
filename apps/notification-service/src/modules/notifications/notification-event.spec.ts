import type { DomainEvent } from '@medcenter/messaging';

import { NOTIFICATION_BINDINGS } from './notification.bindings';
import { InvalidEventError, parseNotificationEvent } from './notification-event';

const ENVELOPE = { v: 1, eventId: 'evt-1', occurredAt: '2026-11-04T08:00:00.000Z' };

const BOOKED = { type: 'appointment.booked.v1', appointmentId: 'apt-1', patientRef: 'Patient/9f2c', start: '2026-11-05T09:30:00Z' };
const CANCELLED = { type: 'appointment.cancelled.v1', appointmentId: 'apt-1', patientRef: 'Patient/9f2c', actorType: 'ADMIN' };
const NOSHOW = { type: 'appointment.noshow.v1', appointmentId: 'apt-1', patientRef: 'Patient/9f2c' };
const COMPLETED = { type: 'encounter.completed.v1', encounterId: 'enc-1', patientRef: 'Patient/9f2c' };
const REGISTERED = { type: 'patient.registered.v1', patientId: '9f2c' };

function event(fields: Record<string, unknown>): DomainEvent {
  return { ...ENVELOPE, ...fields } as unknown as DomainEvent;
}

describe('parseNotificationEvent', () => {
  it.each([BOOKED, CANCELLED, NOSHOW, COMPLETED, REGISTERED])('should accept a well-formed %p', (fields) => {
    const delivered = event(fields);

    expect(parseNotificationEvent(delivered)).toBe(delivered);
  });

  it('should accept the fields older events still carry (a reason, diagnoses, an email)', () => {
    expect(parseNotificationEvent(event({ ...CANCELLED, reason: 'Заболел' }))).toBeDefined();
    expect(parseNotificationEvent(event({ ...COMPLETED, practitionerRef: 'Practitioner/p', diagnoses: [] }))).toBeDefined();
    expect(parseNotificationEvent(event({ ...REGISTERED, email: 'x@y.test' }))).toBeDefined();
  });

  it('should return undefined for an event type the service does not notify on', () => {
    expect(parseNotificationEvent(event({ type: 'something.else.v1' }))).toBeUndefined();
    expect(parseNotificationEvent(event({ type: 'constructor' }))).toBeUndefined();
  });

  it('should refuse a known type without a patient reference, naming the field', () => {
    const withoutPatient = { ...BOOKED, patientRef: undefined };

    expect(() => parseNotificationEvent(event(withoutPatient))).toThrow(InvalidEventError);
    expect(() => parseNotificationEvent(event(withoutPatient))).toThrow('appointment.booked.v1 has an invalid patientRef');
    expect(() => parseNotificationEvent(event({ ...CANCELLED, patientRef: '' }))).toThrow('invalid patientRef');
  });

  it.each(['9f2c', 'Practitioner/9f2c', 'Patient/', 'Patient/a b', 'Patient/Patient/1', 'Patient/9f2c?x=1'])(
    'should refuse the patient reference %p, which would become a wrong recipient',
    (patientRef) => {
      expect(() => parseNotificationEvent(event({ ...NOSHOW, patientRef }))).toThrow('invalid patientRef');
    },
  );

  it('should refuse a booked start that is no instant instead of showing it to the patient', () => {
    expect(() => parseNotificationEvent(event({ ...BOOKED, start: 'soon' }))).toThrow('appointment.booked.v1 has an invalid start');
    expect(() => parseNotificationEvent(event({ ...BOOKED, start: undefined }))).toThrow('invalid start');
  });

  it.each([
    [{ ...BOOKED, appointmentId: 'a/b' }, 'appointmentId'],
    [{ ...CANCELLED, actorType: 'DOCTOR' }, 'actorType'],
    [{ ...COMPLETED, encounterId: '' }, 'encounterId'],
    [{ ...REGISTERED, patientId: 'Patient/1' }, 'patientId'],
    [{ ...REGISTERED, patientId: undefined }, 'patientId'],
  ])('should refuse %p with an invalid %s', (fields, field) => {
    expect(() => parseNotificationEvent(event(fields))).toThrow(`invalid ${field}`);
  });

  it.each([
    [{ v: 2 }, 'v'],
    [{ v: undefined }, 'v'],
    [{ occurredAt: undefined }, 'occurredAt'],
    [{ occurredAt: 'yesterday' }, 'occurredAt'],
    [{ eventId: '' }, 'eventId'],
    [{ eventId: 'e'.repeat(129) }, 'eventId'],
  ])('should refuse the envelope %p', (envelope, field) => {
    const delivered = { ...ENVELOPE, ...envelope, ...NOSHOW } as unknown as DomainEvent;

    expect(() => parseNotificationEvent(delivered)).toThrow(`invalid ${field}`);
  });

  it('should not put the payload into the error', () => {
    const error = (() => {
      try {
        parseNotificationEvent(event({ ...BOOKED, patientRef: 'secret-ref' }));
      } catch (caught) {
        return caught as InvalidEventError;
      }
      return undefined;
    })();

    expect(error?.field).toBe('patientRef');
    expect(error?.message).not.toContain('secret-ref');
  });

  it('should know every event type the queues are bound to, so none is acknowledged as unknown', () => {
    for (const { routingKey } of NOTIFICATION_BINDINGS) {
      expect(() => parseNotificationEvent(event({ type: routingKey }))).toThrow(InvalidEventError);
    }
  });
});
