import type { FhirResource } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';

import { matchesName } from './doctor-name-match';

const EN = (text: string): { extension: unknown[] } => ({ extension: [translationExtension('en', text)] });

/** «Иванова Мария Сергеевна» as the demo seed stores her: Russian text, English in the `translation` extension. */
const IVANOVA: FhirResource = {
  resourceType: 'Practitioner',
  id: '1',
  name: [{ family: 'Иванова', _family: EN('Ivanova'), given: ['Мария', 'Сергеевна'], _given: [EN('Maria'), EN('Sergeevna')] }],
};

describe('matchesName', () => {
  it.each([
    'Иванова',
    'иванова',
    'Ива',
    'Мария',
    'Серг',
    'Мария Иванова',
    'Иванова Мария',
    'Иванова Мария Сергеевна',
    '  Иванова   Мар ',
    'Ivanova',
    'ivan',
    'Maria Ivanova',
    'Ivanova Maria',
    'Maria Иванова',
  ])('should find the doctor by %j, whichever language and word order it is typed in', (term) => {
    expect(matchesName(IVANOVA, term)).toBe(true);
  });

  it.each(['Петров', 'Мария Петрова', 'Ivanova Petrov', 'нова', 'Ivanovx', 'Мария Иванова Петровна'])('should not find the doctor by %j', (term) => {
    expect(matchesName(IVANOVA, term)).toBe(false);
  });

  it('should find a doctor without an English name only by the Russian one', () => {
    const doctor: FhirResource = { resourceType: 'Practitioner', id: '2', name: [{ family: 'Козлов', given: ['Пётр'] }] };

    expect(matchesName(doctor, 'Козлов Пётр')).toBe(true);
    expect(matchesName(doctor, 'Kozlov')).toBe(false);
  });

  it('should treat ё as е, as HAPI does for a string search', () => {
    const doctor: FhirResource = { resourceType: 'Practitioner', id: '3', name: [{ family: 'Фёдоров', given: ['Пётр'] }] };

    expect(matchesName(doctor, 'федоров петр')).toBe(true);
    expect(matchesName(doctor, 'Фёдоров Пётр')).toBe(true);
  });

  it('should find nobody by a name when the practitioner has none', () => {
    expect(matchesName({ resourceType: 'Practitioner', id: '4' }, 'Иванова')).toBe(false);
  });
});
