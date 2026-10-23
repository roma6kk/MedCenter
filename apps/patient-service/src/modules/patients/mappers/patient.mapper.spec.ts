import type { FhirResource } from '@medcenter/fhir';

import { toPatientResponseDto } from './patient.mapper';

const fullPatient: FhirResource = {
  resourceType: 'Patient',
  id: '9f2c',
  active: true,
  identifier: [
    { use: 'official', system: 'https://fhir.by/sid/personal-number', value: '3120590A001PB5' },
    { system: 'urn:ietf:rfc:3986' },
  ],
  name: [
    { use: 'old', family: 'Петрова', given: ['Анна'] },
    { use: 'official', family: 'Иванова', given: ['Анна', 'Сергеевна'] },
  ],
  telecom: [
    { system: 'phone', value: '+375291234567', use: 'mobile' },
    { system: 'email', value: 'ivanova@example.by' },
    { system: 'phone', value: '+375170000000', use: 'old' },
    { system: 'phone' },
  ],
  gender: 'female',
  birthDate: '1990-05-12',
};

describe('toPatientResponseDto', () => {
  it('should map name, birthDate, gender, telecom and identifiers when the Patient is complete', () => {
    // Act
    const dto = toPatientResponseDto(fullPatient);

    // Assert
    expect(dto).toEqual({
      id: '9f2c',
      active: true,
      fullName: 'Иванова Анна Сергеевна',
      lastName: 'Иванова',
      firstName: 'Анна',
      middleName: 'Сергеевна',
      birthDate: '1990-05-12',
      gender: 'female',
      telecom: [
        { system: 'phone', value: '+375291234567', use: 'mobile' },
        { system: 'email', value: 'ivanova@example.by' },
      ],
      identifiers: [{ use: 'official', system: 'https://fhir.by/sid/personal-number', value: '3120590A001PB5' }],
    });
  });

  it('should prefer HumanName.text for fullName when the text is present', () => {
    const patient: FhirResource = { ...fullPatient, name: [{ text: 'Иванова А. С.', family: 'Иванова', given: ['Анна'] }] };

    expect(toPatientResponseDto(patient).fullName).toBe('Иванова А. С.');
  });

  it('should return empty names and lists when the Patient has only an id', () => {
    const dto = toPatientResponseDto({ resourceType: 'Patient', id: 'p-1' });

    expect(dto).toEqual({
      id: 'p-1',
      active: true,
      fullName: '',
      lastName: '',
      firstName: '',
      telecom: [],
      identifiers: [],
    });
  });

  it('should drop a gender outside AdministrativeGender when the stored value is invalid', () => {
    const dto = toPatientResponseDto({ ...fullPatient, gender: 'M' });

    expect(dto.gender).toBeUndefined();
  });

  it('should report an inactive record when Patient.active is false', () => {
    expect(toPatientResponseDto({ ...fullPatient, active: false }).active).toBe(false);
  });

  it('should expose meta.versionId as version when HAPI reports it', () => {
    expect(toPatientResponseDto({ ...fullPatient, meta: { versionId: '7' } }).version).toBe('7');
  });

  it('should omit version when the Patient carries no meta.versionId', () => {
    expect(toPatientResponseDto(fullPatient)).not.toHaveProperty('version');
  });
});
