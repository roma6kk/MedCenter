import type { FhirResource, FhirSearchResult } from '@medcenter/fhir';

import { appointmentsOf, humanNameOf, indexIncluded, toAppointmentView } from './appointment-view.mapper';

const appointment: FhirResource = {
  resourceType: 'Appointment',
  id: 'apt-1',
  status: 'booked',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  created: '2026-10-13',
  slot: [{ reference: 'Slot/slot-1' }],
  participant: [
    { actor: { reference: 'Patient/9f2c' } },
    { actor: { reference: 'PractitionerRole/role-1' } },
    { actor: { reference: 'HealthcareService/svc-1' } },
  ],
};

/** Search Bundle as HAPI returns it for `_include=Appointment:actor&_include:iterate=PractitionerRole:practitioner`. */
const bundle = {
  total: 1,
  entry: [
    { resource: appointment, search: { mode: 'match' } },
    { resource: { resourceType: 'Patient', id: '9f2c', name: [{ family: 'Иванова', given: ['Анна', 'Петровна'] }] }, search: { mode: 'include' } },
    { resource: { resourceType: 'PractitionerRole', id: 'role-1', practitioner: { reference: 'Practitioner/doc-7' } }, search: { mode: 'include' } },
    { resource: { resourceType: 'Practitioner', id: 'doc-7', name: [{ text: 'Петров Иван Сергеевич' }] }, search: { mode: 'include' } },
    { resource: { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' }, search: { mode: 'include' } },
  ],
} as unknown as FhirSearchResult;

describe('humanNameOf', () => {
  it('should prefer HumanName.text when it is present', () => {
    // Arrange
    const practitioner: FhirResource = { resourceType: 'Practitioner', name: [{ text: 'Петров И. С.', family: 'X' }] };

    // Act
    const name = humanNameOf(practitioner);

    // Assert
    expect(name).toBe('Петров И. С.');
  });

  it('should join family and given names when HumanName.text is absent', () => {
    // Arrange
    const patient: FhirResource = { resourceType: 'Patient', name: [{ family: 'Иванова', given: ['Анна', 'Петровна'] }] };

    // Act
    const name = humanNameOf(patient);

    // Assert
    expect(name).toBe('Иванова Анна Петровна');
  });

  it('should return undefined when the resource has no usable name', () => {
    // Arrange
    const resources: readonly (FhirResource | undefined)[] = [undefined, { resourceType: 'Patient' }, { resourceType: 'Patient', name: [{}] }];

    // Act
    const names = resources.map((resource) => humanNameOf(resource));

    // Assert
    expect(names).toEqual([undefined, undefined, undefined]);
  });
});

describe('appointmentsOf', () => {
  it('should return only the Appointment matches when the bundle also carries included resources', () => {
    // Arrange
    const result = bundle;

    // Act
    const appointments = appointmentsOf(result);

    // Assert
    expect(appointments.map((resource) => resource.id)).toEqual(['apt-1']);
  });
});

describe('toAppointmentView', () => {
  it('should enrich the response with doctor, service and patient names when they are included', () => {
    // Arrange
    const included = indexIncluded(bundle);

    // Act
    const view = toAppointmentView(appointment, included);

    // Assert
    expect(view).toMatchObject({
      id: 'apt-1',
      status: 'booked',
      slotId: 'slot-1',
      patientId: '9f2c',
      practitionerRoleId: 'role-1',
      serviceId: 'svc-1',
      doctorId: 'doc-7',
      doctorName: 'Петров Иван Сергеевич',
      serviceName: 'Консультация терапевта',
      patientName: 'Иванова Анна Петровна',
    });
  });

  it('should still map the appointment when no related resource was included', () => {
    // Arrange
    const included = indexIncluded({ entry: [] });

    // Act
    const view = toAppointmentView(appointment, included);

    // Assert
    expect(view).toMatchObject({ id: 'apt-1', doctorId: '', practitionerRoleId: 'role-1' });
    expect(view.doctorName).toBeUndefined();
    expect(view.serviceName).toBeUndefined();
  });
});

describe('toAppointmentView in English', () => {
  const en = (content: string): { extension: unknown[] } => ({
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/translation',
        extension: [
          { url: 'lang', valueCode: 'en' },
          { url: 'content', valueString: content },
        ],
      },
    ],
  });
  const translatedBundle = {
    entry: [
      { resource: appointment, search: { mode: 'match' } },
      {
        resource: {
          resourceType: 'PractitionerRole',
          id: 'role-1',
          practitioner: { reference: 'Practitioner/doc-7' },
        },
        search: { mode: 'include' },
      },
      {
        resource: {
          resourceType: 'Practitioner',
          id: 'doc-7',
          name: [
            {
              text: 'Иванов Иван Иванович',
              family: 'Иванов',
              _family: en('Ivanov'),
              given: ['Иван', 'Иванович'],
              _given: [en('Ivan'), en('Ivanovich')],
            },
          ],
        },
        search: { mode: 'include' },
      },
      {
        resource: {
          resourceType: 'HealthcareService',
          id: 'svc-1',
          name: 'Приём терапевта (первичный)',
          _name: en('Therapist appointment (initial)'),
        },
        search: { mode: 'include' },
      },
    ],
  } as unknown as FhirSearchResult;

  it('should answer the doctor and the service in English when the translations exist', () => {
    const view = toAppointmentView(appointment, indexIncluded(translatedBundle), 'en');

    expect(view.doctorName).toBe('Ivanov Ivan Ivanovich');
    expect(view.serviceName).toBe('Therapist appointment (initial)');
  });

  it('should keep Russian when the language is ru or not given', () => {
    const included = indexIncluded(translatedBundle);

    expect(toAppointmentView(appointment, included).doctorName).toBe('Иванов Иван Иванович');
    expect(toAppointmentView(appointment, included, 'ru').serviceName).toBe('Приём терапевта (первичный)');
  });

  it('should fall back to the stored Russian values when there is no translation', () => {
    const view = toAppointmentView(appointment, indexIncluded(bundle), 'en');

    expect(view.doctorName).toBe('Петров Иван Сергеевич');
    expect(view.serviceName).toBe('Консультация терапевта');
    expect(view.patientName).toBe('Иванова Анна Петровна');
  });
});
