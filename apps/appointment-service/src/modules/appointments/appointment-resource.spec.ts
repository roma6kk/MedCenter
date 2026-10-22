import type { FhirResource } from '@medcenter/fhir';

import { buildBookedAppointment, rolePractitionerId, scheduleActorId } from './appointment-resource';

function scheduleWith(...references: readonly string[]): FhirResource {
  return { resourceType: 'Schedule', id: 'sched-1', actor: references.map((reference) => ({ reference })) };
}

describe('scheduleActorId', () => {
  it('should return the bare id of the actor of the requested type when the references are relative', () => {
    // Arrange
    const schedule = scheduleWith('PractitionerRole/role-1', 'Location/room-1', 'HealthcareService/svc-1');

    // Act
    const ids = [scheduleActorId(schedule, 'PractitionerRole'), scheduleActorId(schedule, 'HealthcareService')];

    // Assert
    expect(ids).toEqual(['role-1', 'svc-1']);
  });

  it('should resolve the actor when the stored reference is absolute', () => {
    // Arrange
    const schedule = scheduleWith('http://hapi:8080/fhir/PractitionerRole/role-1');

    // Act
    const id = scheduleActorId(schedule, 'PractitionerRole');

    // Assert
    expect(id).toBe('role-1');
  });

  it('should not confuse a type whose name only starts with the requested one', () => {
    // Arrange
    const schedule = scheduleWith('PractitionerRole/role-1');

    // Act
    const id = scheduleActorId(schedule, 'Practitioner');

    // Assert
    expect(id).toBe('');
  });
});

describe('rolePractitionerId', () => {
  it('should return the bare Practitioner id when the role names a practitioner', () => {
    const role: FhirResource = { resourceType: 'PractitionerRole', id: 'role-1', practitioner: { reference: 'Practitioner/doc-1' } };

    expect(rolePractitionerId(role)).toBe('doc-1');
  });

  it('should return an empty id when the role names no practitioner or a resource of another type', () => {
    const other: FhirResource = { resourceType: 'PractitionerRole', id: 'role-1', practitioner: { reference: 'Organization/org-1' } };

    expect([rolePractitionerId({ resourceType: 'PractitionerRole', id: 'role-1' }), rolePractitionerId(other)]).toEqual(['', '']);
  });
});

describe('buildBookedAppointment', () => {
  const slot: FhirResource = { resourceType: 'Slot', id: 'slot-1', start: '2026-11-02T06:00:00.000Z', end: '2026-11-02T06:30:00.000Z' };
  const bookable = { slotId: 'slot-1', slot, practitionerRoleId: 'role-1', practitionerId: 'doc-1', serviceId: 'svc-1' };

  function actorsOf(appointment: FhirResource): string[] {
    return (appointment['participant'] as Array<{ actor: { reference: string } }>).map((participant) => participant.actor.reference);
  }

  it('should list the Practitioner behind the role as a participant so the doctor id travels with the appointment', () => {
    expect(actorsOf(buildBookedAppointment(bookable, 'Patient/p-1', undefined))).toEqual([
      'Patient/p-1',
      'PractitionerRole/role-1',
      'Practitioner/doc-1',
      'HealthcareService/svc-1',
    ]);
  });

  it('should record when it was created as an RFC 3339 instant, not only the day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T07:07:58.285Z'));
    try {
      expect(buildBookedAppointment(bookable, 'Patient/p-1', undefined)['created']).toBe('2026-10-22T07:07:58.285Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('should leave the Practitioner participant out when the role names none', () => {
    const appointment = buildBookedAppointment({ ...bookable, practitionerId: '' }, 'Patient/p-1', 'боль');

    expect(actorsOf(appointment)).toEqual(['Patient/p-1', 'PractitionerRole/role-1', 'HealthcareService/svc-1']);
  });
});
