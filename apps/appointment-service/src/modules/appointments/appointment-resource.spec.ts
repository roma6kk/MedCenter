import type { FhirResource } from '@medcenter/fhir';

import { scheduleActorId } from './appointment-resource';

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
