import type { FhirResource } from '@medcenter/fhir';

import { toDoctorResponseDto } from './practitioner.mapper';
import { translationExtension } from './translation';

function practitioner(name: unknown): FhirResource {
  return { resourceType: 'Practitioner', id: 'p1', name } as FhirResource;
}

/** The English text of a primitive, in the `translation` extension HAPI keeps next to the Russian one. */
function inEnglish(content: string): { extension: unknown[] } {
  return { extension: [translationExtension('en', content)] };
}

describe('toDoctorResponseDto patronymic', () => {
  const ivanova = practitioner([
    {
      family: 'Иванова',
      _family: inEnglish('Ivanova'),
      given: ['Мария', 'Сергеевна'],
      _given: [inEnglish('Maria'), inEnglish('Sergeevna')],
    },
  ]);

  it('should read the second given name as the middle name', () => {
    expect(toDoctorResponseDto(ivanova)).toMatchObject({ firstName: 'Мария', middleName: 'Сергеевна', lastName: 'Иванова' });
  });

  it('should translate the middle name like the first name when English is asked', () => {
    expect(toDoctorResponseDto(ivanova, 'en')).toMatchObject({ firstName: 'Maria', middleName: 'Sergeevna', lastName: 'Ivanova' });
  });

  it('should keep the Russian middle name when it has no English translation', () => {
    const partly = practitioner([{ family: 'Иванова', given: ['Мария', 'Сергеевна'], _given: [inEnglish('Maria'), null] }]);

    expect(toDoctorResponseDto(partly, 'en')).toMatchObject({ firstName: 'Maria', middleName: 'Сергеевна' });
  });

  it.each([
    ['one given name', [{ family: 'Иванова', given: ['Мария'] }]],
    ['no given name', [{ family: 'Иванова' }]],
    ['a blank second given name', [{ family: 'Иванова', given: ['Мария', '  '] }]],
    ['a second given name that is not a text', [{ family: 'Иванова', given: ['Мария', 7] }]],
    ['no name at all', undefined],
  ])('should leave the middle name out for %s', (_label, name) => {
    expect(toDoctorResponseDto(practitioner(name))).not.toHaveProperty('middleName');
  });

  it('should not take a third given name for the middle name', () => {
    const doctor = toDoctorResponseDto(practitioner([{ family: 'Иванова', given: ['Мария', 'Сергеевна', 'Ольга'] }]));

    expect(doctor.middleName).toBe('Сергеевна');
  });
});
