import type { DomainEvent } from '@medcenter/messaging';

import { communicationFromEvent } from './communication.mapper';

const BASE = { eventId: 'evt-1', occurredAt: '2026-10-22T08:00:00.000Z' };

function event(fields: Record<string, unknown>): DomainEvent {
  return { ...BASE, ...fields } as unknown as DomainEvent;
}

describe('communicationFromEvent', () => {
  it('should state the booked start in Minsk time and point at the appointment when a visit is booked', () => {
    const communication = communicationFromEvent(
      event({ type: 'appointment.booked.v1', appointmentId: '3150', patientRef: 'Patient/1439', start: '2026-10-22T09:30:00.000Z' }),
    );

    expect(communication?.['payload']).toEqual([{ contentString: 'Вы записаны на приём. Начало: 22.10.2026 12:30 (время Минска)' }]);
    expect(communication?.['about']).toEqual([{ reference: 'Appointment/3150' }]);
    expect(communication?.['recipient']).toEqual([{ reference: 'Patient/1439' }]);
  });

  it('should keep a start that is no instant as it came, rather than lose it', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.booked.v1', appointmentId: '1', patientRef: 'Patient/1', start: 'soon' }));

    expect(communication?.['payload']).toEqual([{ contentString: 'Вы записаны на приём. Начало: soon (время Минска)' }]);
  });

  it('should point a cancellation at its appointment and an encounter notice at its encounter', () => {
    const cancelled = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', reason: 'Заболел', actorType: 'PATIENT' }));
    const completed = communicationFromEvent(event({ type: 'encounter.completed.v1', encounterId: 'e9', patientRef: 'Patient/1', practitionerRef: 'Practitioner/p', diagnoses: [] }));

    expect(cancelled?.['about']).toEqual([{ reference: 'Appointment/7' }]);
    expect(completed?.['about']).toEqual([{ reference: 'Encounter/e9' }]);
  });

  it('should word a cancellation without the reason even when an older event still carries one', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', reason: 'Заболел', actorType: 'PATIENT' }));

    expect(communication?.['payload']).toEqual([{ contentString: 'Запись на приём отменена.' }]);
  });

  it('should notify on minimised events that carry no diagnoses and no email', () => {
    const completed = communicationFromEvent(event({ type: 'encounter.completed.v1', encounterId: 'e9', patientRef: 'Patient/1', practitionerRef: 'Practitioner/p', diagnosisCount: 1 }));
    const registered = communicationFromEvent(event({ type: 'patient.registered.v1', patientId: '5' }));

    expect(completed?.['recipient']).toEqual([{ reference: 'Patient/1' }]);
    expect(registered?.['recipient']).toEqual([{ reference: 'Patient/5' }]);
  });

  it('should leave about out when the event names nothing to point at, such as a registration', () => {
    const communication = communicationFromEvent(event({ type: 'patient.registered.v1', patientId: '5', email: 'x@y.test' }));

    expect(communication).toBeDefined();
    expect(communication).not.toHaveProperty('about');
    expect(JSON.stringify(communication)).not.toContain('x@y.test');
  });
});
