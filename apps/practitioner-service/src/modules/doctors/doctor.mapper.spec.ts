import type { FhirResource } from '@medcenter/fhir';

import { toDoctorDto } from './doctor.mapper';

function practitioner(name: unknown): FhirResource {
  return { resourceType: 'Practitioner', id: 'p1', name } as FhirResource;
}

describe('toDoctorDto', () => {
  it('should join the given and family names into the display name when both are present', () => {
    // Act
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова', given: ['Мария', 'Сергеевна'] }]));

    // Assert
    expect(doctor).toMatchObject({ id: 'p1', name: 'Мария Иванова', firstName: 'Мария', lastName: 'Иванова' });
  });

  it('should leave no stray space in the display name when the given name is missing', () => {
    // Act
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова' }]));

    // Assert
    expect(doctor.name).toBe('Иванова');
  });

  it('should return an empty display name when the practitioner has no name', () => {
    // Act
    const doctor = toDoctorDto({ resourceType: 'Practitioner', id: 'p2' });

    // Assert
    expect(doctor.name).toBe('');
  });

  it('should keep the specialty of the shared mapping when a qualification is present', () => {
    // Act
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p3',
      name: [{ family: 'Петров', given: ['Иван'] }],
      qualification: [{ code: { text: 'Терапевт' } }],
    } as FhirResource);

    // Assert
    expect(doctor).toMatchObject({ name: 'Иван Петров', specialty: 'Терапевт' });
  });

  it('should expose the specialty coding as a token usable in the specialty filter when the qualification is coded', () => {
    // Act
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p4',
      qualification: [{ code: { coding: [{ system: 'http://snomed.info/sct', code: '419192003', display: 'Терапия' }], text: 'Терапевт' } }],
    } as FhirResource);

    // Assert
    expect(doctor).toMatchObject({ specialty: 'Терапевт', specialtyCode: '419192003', specialtySystem: 'http://snomed.info/sct' });
  });

  it('should leave the code without a system when the coding carries none', () => {
    // Act
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p5',
      qualification: [{ code: { coding: [{ code: 'THER' }] } }],
    } as FhirResource);

    // Assert
    expect(doctor.specialtyCode).toBe('THER');
    expect(doctor.specialtySystem).toBeUndefined();
  });

  it('should expose no specialty token when the qualification is free text only', () => {
    // Act
    const doctor = toDoctorDto({ resourceType: 'Practitioner', id: 'p6', qualification: [{ code: { text: 'Терапевт' } }] } as FhirResource);

    // Assert
    expect(doctor.specialtyCode).toBeUndefined();
    expect(doctor.specialtySystem).toBeUndefined();
  });

  it('should carry the given role ids and default to none', () => {
    // Act
    const withRoles = toDoctorDto({ resourceType: 'Practitioner', id: 'p7' }, ['r1', 'r2']);
    const without = toDoctorDto({ resourceType: 'Practitioner', id: 'p8' });

    // Assert
    expect(withRoles.practitionerRoleIds).toEqual(['r1', 'r2']);
    expect(without.practitionerRoleIds).toEqual([]);
  });
});
