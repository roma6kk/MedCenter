import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';

import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

const ivanova = {
  resourceType: 'Practitioner',
  id: '7',
  name: [
    {
      family: 'Иванова',
      _family: { extension: [translationExtension('en', 'Ivanova')] },
      given: ['Мария'],
      _given: [{ extension: [translationExtension('en', 'Maria')] }],
    },
  ],
  qualification: [{ code: { text: 'Терапевт', _text: { extension: [translationExtension('en', 'Therapist')] } } }],
} as unknown as FhirResource;

describe('doctor catalog language (Accept-Language)', () => {
  let controller: DoctorsController;

  beforeEach(() => {
    const fhirClient = {
      read: jest.fn().mockResolvedValue(ivanova),
      search: jest.fn().mockImplementation((type: string) =>
        Promise.resolve({ entry: type === 'Practitioner' ? [{ resource: ivanova }] : [], total: 1 }),
      ),
    } as unknown as jest.Mocked<FhirClient>;
    controller = new DoctorsController(new DoctorsService(fhirClient));
  });

  it('should answer a card in English when the header asks for en', async () => {
    const doctor = await controller.findById({ id: '7' }, 'en-US,en;q=0.9');

    expect(doctor).toMatchObject({ name: 'Maria Ivanova', specialty: 'Therapist' });
  });

  it('should answer a card in Russian when the header is absent or another language', async () => {
    expect(await controller.findById({ id: '7' })).toMatchObject({ name: 'Мария Иванова', specialty: 'Терапевт' });
    expect(await controller.findById({ id: '7' }, 'de')).toMatchObject({ name: 'Мария Иванова' });
  });

  it('should localize every doctor of a list', async () => {
    const page = await controller.list({}, 'en');

    expect(page.items[0]).toMatchObject({ name: 'Maria Ivanova', firstName: 'Maria', lastName: 'Ivanova', specialty: 'Therapist' });
  });
});
