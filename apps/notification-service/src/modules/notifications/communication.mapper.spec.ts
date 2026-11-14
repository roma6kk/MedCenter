import { MEDCENTER_EXT } from '@medcenter/terminology';

import { communicationFromEvent } from './communication.mapper';
import type { NotificationEvent } from './notification-event';
import { NOTIFICATION_KIND_SYSTEM, NOTIFICATION_KINDS } from './notification-kind';

const BASE = { v: 1, eventId: 'evt-1', occurredAt: '2026-10-22T08:00:00.000Z' };

function event(fields: Record<string, unknown>): NotificationEvent {
  return { ...BASE, ...fields } as unknown as NotificationEvent;
}

describe('communicationFromEvent', () => {
  it('should state the booked start in Minsk time and point at the appointment when a visit is booked', () => {
    const communication = communicationFromEvent(
      event({ type: 'appointment.booked.v1', appointmentId: '3150', patientRef: 'Patient/1439', start: '2026-10-22T09:30:00.000Z' }),
    );

    expect(communication['payload']).toEqual([{ contentString: 'Вы записаны на приём. Начало: 22.10.2026 12:30 (время Минска)' }]);
    expect(communication['about']).toEqual([{ reference: 'Appointment/3150' }]);
    expect(communication['recipient']).toEqual([{ reference: 'Patient/1439' }]);
  });

  it('should point a cancellation at its appointment and an encounter notice at its encounter', () => {
    const cancelled = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', reason: 'Заболел', actorType: 'PATIENT' }));
    const completed = communicationFromEvent(event({ type: 'encounter.completed.v1', encounterId: 'e9', patientRef: 'Patient/1', practitionerRef: 'Practitioner/p', diagnoses: [] }));

    expect(cancelled['about']).toEqual([{ reference: 'Appointment/7' }]);
    expect(completed['about']).toEqual([{ reference: 'Encounter/e9' }]);
  });

  it('should word an encounter notice without the term medical card', () => {
    const completed = communicationFromEvent(event({ type: 'encounter.completed.v1', encounterId: 'e9', patientRef: 'Patient/1', practitionerRef: 'Practitioner/p', diagnoses: [] }));

    expect(JSON.stringify(completed)).toContain('Результаты приёма доступны в личном кабинете.');
    expect(JSON.stringify(completed)).not.toMatch(/карт/);
  });

  it('should word a cancellation without the reason even when an older event still carries one', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', reason: 'Заболел', actorType: 'PATIENT' }));

    expect(communication['payload']).toEqual([{ contentString: 'Запись на приём отменена.' }]);
  });

  it('should say the clinic cancelled the appointment, without a reason, when an administrator cancelled it', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', reason: 'Врач заболел', actorType: 'ADMIN' }));

    expect(communication['payload']).toEqual([
      { contentString: 'Клиника отменила вашу запись на приём. Выберите другое время в разделе «Записаться».' },
    ]);
    expect(JSON.stringify(communication)).not.toContain('Врач заболел');
    expect(communication['about']).toEqual([{ reference: 'Appointment/7' }]);
  });

  it('should keep the plain wording for a cancellation by the patient', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.cancelled.v1', appointmentId: '7', patientRef: 'Patient/1', actorType: 'PATIENT' }));

    expect(communication['payload']).toEqual([{ contentString: 'Запись на приём отменена.' }]);
  });

  it('should tell the patient the doctor recorded a no-show and point at the appointment', () => {
    const communication = communicationFromEvent(event({ type: 'appointment.noshow.v1', appointmentId: '12', patientRef: 'Patient/1439' }));

    expect(communication['category']).toEqual([{ text: 'appointment' }]);
    expect(communication['payload']).toEqual([{ contentString: 'Приём отмечен как несостоявшийся: врач зафиксировал неявку.' }]);
    expect(communication['about']).toEqual([{ reference: 'Appointment/12' }]);
    expect(communication['recipient']).toEqual([{ reference: 'Patient/1439' }]);
  });

  describe('kind', () => {
    const kindOf = (fields: Record<string, unknown>): unknown => {
      const topic = communicationFromEvent(event(fields))['topic'] as { coding: Array<{ system: string; code: string }> };
      expect(topic.coding.map((coding) => coding.system)).toEqual([NOTIFICATION_KIND_SYSTEM]);
      return topic.coding[0]?.code;
    };

    it.each([
      [{ type: 'appointment.booked.v1', appointmentId: '1', patientRef: 'Patient/1', start: '2026-10-22T09:30:00.000Z' }, 'appointment.booked'],
      [{ type: 'appointment.cancelled.v1', appointmentId: '1', patientRef: 'Patient/1', actorType: 'PATIENT' }, 'appointment.cancelled'],
      [{ type: 'appointment.cancelled.v1', appointmentId: '1', patientRef: 'Patient/1', actorType: 'ADMIN' }, 'appointment.cancelled.by-admin'],
      [{ type: 'appointment.noshow.v1', appointmentId: '1', patientRef: 'Patient/1' }, 'appointment.noshow'],
      [{ type: 'encounter.completed.v1', encounterId: 'e1', patientRef: 'Patient/1' }, 'encounter.completed'],
      [{ type: 'patient.registered.v1', patientId: '5' }, 'patient.registered'],
    ])('should store %p as the kind %s so a client can word it in the UI language', (fields, kind) => {
      expect(kindOf(fields)).toBe(kind);
    });

    it('should use every kind of the API once', () => {
      const kinds = [
        { type: 'appointment.booked.v1', appointmentId: '1', patientRef: 'Patient/1', start: '2026-10-22T09:30:00.000Z' },
        { type: 'appointment.cancelled.v1', appointmentId: '1', patientRef: 'Patient/1', actorType: 'PATIENT' },
        { type: 'appointment.cancelled.v1', appointmentId: '1', patientRef: 'Patient/1', actorType: 'ADMIN' },
        { type: 'appointment.noshow.v1', appointmentId: '1', patientRef: 'Patient/1' },
        { type: 'encounter.completed.v1', encounterId: 'e1', patientRef: 'Patient/1' },
        { type: 'patient.registered.v1', patientId: '5' },
      ].map(kindOf);

      expect([...kinds].sort()).toEqual([...NOTIFICATION_KINDS].sort());
    });
  });

  describe('start', () => {
    const extensionOf = (communication: Record<string, unknown>): unknown => communication['extension'];

    it('should carry the booked start as a UTC instant in an extension, whatever offset the event had', () => {
      const withOffset = communicationFromEvent(event({ type: 'appointment.booked.v1', appointmentId: '1', patientRef: 'Patient/1', start: '2026-11-02T09:00:00+03:00' }));
      const utc = communicationFromEvent(event({ type: 'appointment.booked.v1', appointmentId: '1', patientRef: 'Patient/1', start: '2026-11-02T06:00:00Z' }));

      const expected = [{ url: MEDCENTER_EXT.NOTIFICATION_APPOINTMENT_START, valueDateTime: '2026-11-02T06:00:00.000Z' }];
      expect(extensionOf(withOffset)).toEqual(expected);
      expect(extensionOf(utc)).toEqual(expected);
    });

    it.each([
      { type: 'appointment.cancelled.v1', appointmentId: '1', patientRef: 'Patient/1', actorType: 'ADMIN' },
      { type: 'appointment.noshow.v1', appointmentId: '1', patientRef: 'Patient/1' },
      { type: 'encounter.completed.v1', encounterId: 'e1', patientRef: 'Patient/1' },
      { type: 'patient.registered.v1', patientId: '5' },
    ])('should write no extension for %p, which has no start to tell', (fields) => {
      expect(communicationFromEvent(event(fields))).not.toHaveProperty('extension');
    });
  });

  it('should notify on minimised events that carry no diagnoses and no email', () => {
    const completed = communicationFromEvent(event({ type: 'encounter.completed.v1', encounterId: 'e9', patientRef: 'Patient/1', practitionerRef: 'Practitioner/p', diagnosisCount: 1 }));
    const registered = communicationFromEvent(event({ type: 'patient.registered.v1', patientId: '5' }));

    expect(completed['recipient']).toEqual([{ reference: 'Patient/1' }]);
    expect(registered['recipient']).toEqual([{ reference: 'Patient/5' }]);
  });

  it('should leave about out when the event names nothing to point at, such as a registration', () => {
    const communication = communicationFromEvent(event({ type: 'patient.registered.v1', patientId: '5', email: 'x@y.test' }));

    expect(communication).toBeDefined();
    expect(communication).not.toHaveProperty('about');
    expect(JSON.stringify(communication)).not.toContain('x@y.test');
  });
});
