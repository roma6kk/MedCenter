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
});
