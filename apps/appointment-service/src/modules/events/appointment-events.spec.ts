import { bookedEvent, cancelledEvent, noshowEvent } from './appointment-events';

const BOOKED = {
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
} as const;

describe('appointment events', () => {
  it('should build an appointment.booked.v1 envelope with a fresh eventId when a booking is announced', () => {
    const event = bookedEvent(BOOKED);

    expect(event).toMatchObject({ ...BOOKED, v: 1, type: 'appointment.booked.v1' });
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
  });

  it('should build an appointment.cancelled.v1 envelope with the actor type and no reason when a cancellation is announced', () => {
    const event = cancelledEvent({ appointmentId: 'apt-1', patientRef: 'Patient/pat-1', actorType: 'PATIENT' });

    expect(event).toMatchObject({ v: 1, type: 'appointment.cancelled.v1', actorType: 'PATIENT' });
    expect(event).not.toHaveProperty('reason');
  });

  it('should build an appointment.noshow.v1 envelope that carries the ids only when a no-show is announced', () => {
    const event = noshowEvent({ appointmentId: 'apt-1', patientRef: 'Patient/pat-1' });

    expect(event).toMatchObject({ v: 1, type: 'appointment.noshow.v1', appointmentId: 'apt-1', patientRef: 'Patient/pat-1' });
    expect(Object.keys(event).sort()).toEqual(['appointmentId', 'eventId', 'occurredAt', 'patientRef', 'type', 'v']);
  });

  it('should use a different eventId for every event', () => {
    expect(bookedEvent(BOOKED).eventId).not.toBe(bookedEvent(BOOKED).eventId);
  });
});
