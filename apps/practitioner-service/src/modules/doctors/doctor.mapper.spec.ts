import type { FhirResource } from '@medcenter/fhir';

import { translationExtension } from '@medcenter/fhir-mappers';

import { toDoctorDto } from './doctor.mapper';

function practitioner(name: unknown): FhirResource {
  return { resourceType: 'Practitioner', id: 'p1', name } as FhirResource;
}

describe('toDoctorDto', () => {
  it('should join the given and family names into the display name when both are present', () => {
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова', given: ['Мария', 'Сергеевна'] }]));

    expect(doctor).toMatchObject({ id: 'p1', name: 'Мария Иванова', firstName: 'Мария', lastName: 'Иванова' });
  });

  it('should carry the patronymic as middleName and keep it out of the display name', () => {
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова', given: ['Мария', 'Сергеевна'] }]));

    expect(doctor).toMatchObject({ name: 'Мария Иванова', firstName: 'Мария', lastName: 'Иванова', middleName: 'Сергеевна' });
  });

  it('should leave middleName out when the doctor has no patronymic', () => {
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова', given: ['Мария'] }]));

    expect(doctor).not.toHaveProperty('middleName');
  });

  it('should leave no stray space in the display name when the given name is missing', () => {
    const doctor = toDoctorDto(practitioner([{ family: 'Иванова' }]));

    expect(doctor.name).toBe('Иванова');
  });

  it('should return an empty display name when the practitioner has no name', () => {
    const doctor = toDoctorDto({ resourceType: 'Practitioner', id: 'p2' });

    expect(doctor.name).toBe('');
  });

  it('should keep the specialty of the shared mapping when a qualification is present', () => {
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p3',
      name: [{ family: 'Петров', given: ['Иван'] }],
      qualification: [{ code: { text: 'Терапевт' } }],
    } as FhirResource);

    expect(doctor).toMatchObject({ name: 'Иван Петров', specialty: 'Терапевт' });
  });

  it('should expose the specialty coding as a token usable in the specialty filter when the qualification is coded', () => {
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p4',
      qualification: [{ code: { coding: [{ system: 'http://snomed.info/sct', code: '419192003', display: 'Терапия' }], text: 'Терапевт' } }],
    } as FhirResource);

    expect(doctor).toMatchObject({ specialty: 'Терапевт', specialtyCode: '419192003', specialtySystem: 'http://snomed.info/sct' });
  });

  it('should leave the code without a system when the coding carries none', () => {
    const doctor = toDoctorDto({
      resourceType: 'Practitioner',
      id: 'p5',
      qualification: [{ code: { coding: [{ code: 'THER' }] } }],
    } as FhirResource);

    expect(doctor.specialtyCode).toBe('THER');
    expect(doctor.specialtySystem).toBeUndefined();
  });

  it('should expose no specialty token when the qualification is free text only', () => {
    const doctor = toDoctorDto({ resourceType: 'Practitioner', id: 'p6', qualification: [{ code: { text: 'Терапевт' } }] } as FhirResource);

    expect(doctor.specialtyCode).toBeUndefined();
    expect(doctor.specialtySystem).toBeUndefined();
  });

  it('should carry the given role ids and default to none', () => {
    const withRoles = toDoctorDto({ resourceType: 'Practitioner', id: 'p7' }, ['r1', 'r2']);
    const without = toDoctorDto({ resourceType: 'Practitioner', id: 'p8' });

    expect(withRoles.practitionerRoleIds).toEqual(['r1', 'r2']);
    expect(without.practitionerRoleIds).toEqual([]);
  });
});

describe('toDoctorDto localization', () => {
  const localized: FhirResource = {
    resourceType: 'Practitioner',
    id: 'p9',
    name: [
      {
        family: 'Иванова',
        _family: { extension: [translationExtension('en', 'Ivanova')] },
        given: ['Мария', 'Сергеевна'],
        _given: [{ extension: [translationExtension('en', 'Maria')] }, null],
      },
    ],
    qualification: [
      {
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '419192003', display: 'Терапия' }],
          text: 'Терапевт',
          _text: { extension: [translationExtension('en', 'Therapist')] },
        },
      },
    ],
  } as unknown as FhirResource;

  it('should keep the Russian values when no language is given', () => {
    expect(toDoctorDto(localized)).toMatchObject({ name: 'Мария Иванова', firstName: 'Мария', lastName: 'Иванова', specialty: 'Терапевт' });
  });

  it('should return the English name and specialty when English is asked', () => {
    expect(toDoctorDto(localized, [], 'en')).toMatchObject({ name: 'Maria Ivanova', firstName: 'Maria', lastName: 'Ivanova', specialty: 'Therapist' });
  });

  it('should return the English patronymic when English is asked, and the Russian one when it has no translation', () => {
    const translated = {
      ...localized,
      name: [{ family: 'Иванова', given: ['Мария', 'Сергеевна'], _given: [{ extension: [translationExtension('en', 'Maria')] }, { extension: [translationExtension('en', 'Sergeevna')] }] }],
    } as unknown as FhirResource;

    expect(toDoctorDto(translated, [], 'en')).toMatchObject({ firstName: 'Maria', middleName: 'Sergeevna' });
    expect(toDoctorDto(translated)).toMatchObject({ firstName: 'Мария', middleName: 'Сергеевна' });
    expect(toDoctorDto(localized, [], 'en')).toMatchObject({ firstName: 'Maria', middleName: 'Сергеевна' });
  });

  it('should fall back to the Russian value of whatever has no translation', () => {
    const partial = { ...localized, qualification: [{ code: { text: 'Терапевт' } }] } as unknown as FhirResource;
    expect(toDoctorDto(partial, [], 'en')).toMatchObject({ name: 'Maria Ivanova', specialty: 'Терапевт' });
  });

  it('should translate the coding display when the qualification has no text', () => {
    const coded = {
      ...localized,
      qualification: [{ code: { coding: [{ code: '1', display: 'Терапия', _display: { extension: [translationExtension('en', 'Therapy')] } }] } }],
    } as unknown as FhirResource;
    expect(toDoctorDto(coded, [], 'en').specialty).toBe('Therapy');
  });
});

