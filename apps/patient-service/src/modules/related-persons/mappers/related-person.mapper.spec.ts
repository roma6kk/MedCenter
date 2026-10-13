import type { FhirResource } from '@medcenter/fhir';

import { relatedPatientIdOf, toRelatedPersonResponseDto } from './related-person.mapper';

const relatedPerson: FhirResource = {
  resourceType: 'RelatedPerson',
  id: 'rp-1',
  patient: { reference: 'Patient/9f2c' },
  relationship: [
    {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'C', display: 'Emergency Contact' }],
    },
  ],
  name: [{ use: 'official', family: 'Петров', given: ['Олег'] }],
  birthDate: '1965-02-01',
  gender: 'male',
  telecom: [{ system: 'phone', value: '+375291112233' }],
};

describe('relatedPatientIdOf', () => {
  it('should return the bare id when the patient reference is relative', () => {
    expect(relatedPatientIdOf(relatedPerson)).toBe('9f2c');
  });

  it('should return the bare id when the patient reference is absolute', () => {
    const absolute: FhirResource = { ...relatedPerson, patient: { reference: 'http://hapi:8080/fhir/Patient/9f2c' } };

    expect(relatedPatientIdOf(absolute)).toBe('9f2c');
  });

  it('should return an empty id when the reference points at another resource type', () => {
    const foreign: FhirResource = { ...relatedPerson, patient: { reference: 'Practitioner/9f2c' } };

    expect(relatedPatientIdOf(foreign)).toBe('');
  });

  it('should return an empty id when the RelatedPerson has no patient reference', () => {
    const withoutPatient: FhirResource = { resourceType: 'RelatedPerson', id: 'rp-2' };

    expect(relatedPatientIdOf(withoutPatient)).toBe('');
  });
});

describe('toRelatedPersonResponseDto', () => {
  it('should map relationship, name, birthDate, gender and telecom when the RelatedPerson is complete', () => {
    // Act
    const dto = toRelatedPersonResponseDto(relatedPerson);

    // Assert
    expect(dto).toEqual({
      id: 'rp-1',
      patientId: '9f2c',
      active: true,
      fullName: 'Петров Олег',
      lastName: 'Петров',
      firstName: 'Олег',
      relationship: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'C', display: 'Emergency Contact' }],
      gender: 'male',
      birthDate: '1965-02-01',
      telecom: [{ system: 'phone', value: '+375291112233' }],
    });
  });

  it('should report an inactive trusted person when RelatedPerson.active is false', () => {
    expect(toRelatedPersonResponseDto({ ...relatedPerson, active: false }).active).toBe(false);
  });
});
