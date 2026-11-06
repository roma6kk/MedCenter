import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';
import { FHIR_BY } from '@medcenter/terminology';

import { committedEntries, transactionResponder } from '@medcenter/testing';
import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

/** The HealthcareService the service put into the committed transaction. */
function written(fhir: jest.Mocked<FhirClient>): Record<string, unknown> {
  const entry = committedEntries(fhir).find((candidate) => candidate.resource?.resourceType === 'HealthcareService');
  return (entry?.resource ?? {}) as unknown as Record<string, unknown>;
}

const stored: FhirResource = {
  resourceType: 'HealthcareService',
  id: 's1',
  name: 'Приём терапевта',
  _name: { extension: [translationExtension('en', 'Therapist appointment')] },
  comment: 'Первичная консультация',
  _comment: { extension: [translationExtension('en', 'First consultation')] },
  type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10001', display: 'Консультация' }] }],
} as unknown as FhirResource;

describe('ServicesService language', () => {
  let fhirClient: jest.Mocked<FhirClient>;
  let store: InMemoryCacheStore;
  let service: ServicesService;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn().mockResolvedValue({ entry: [{ resource: stored }], total: 1 }),
      read: jest.fn().mockResolvedValue(stored),
      operation: jest.fn().mockResolvedValue({ resourceType: 'Parameters' }),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    store = new InMemoryCacheStore();
    service = new ServicesService(fhirClient, new RedisCacheService(store));
  });

  it('should return the English name and description when English is asked', async () => {
    const dto = await service.findById('s1', 'en');

    expect(dto).toMatchObject({ name: 'Therapist appointment', description: 'First consultation', nameEn: 'Therapist appointment', descriptionEn: 'First consultation' });
  });

  it('should return the Russian values when Russian is asked, still exposing the stored English text', async () => {
    const dto = await service.findById('s1');

    expect(dto).toMatchObject({ name: 'Приём терапевта', description: 'Первичная консультация', nameEn: 'Therapist appointment' });
  });

  it('should fall back to the Russian text when the service has no translation', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'HealthcareService', id: 's2', name: 'ЭКГ' });

    const dto = await service.findById('s2', 'en');

    expect(dto.name).toBe('ЭКГ');
    expect(dto.nameEn).toBeUndefined();
  });

  it('should cache the plain listing per language so neither is served as the other', async () => {
    const english = await service.list(1, 20, undefined, 'en');
    const russian = await service.list(1, 20, undefined, 'ru');
    const englishAgain = await service.list(1, 20, undefined, 'en');

    expect(english.items[0]?.name).toBe('Therapist appointment');
    expect(russian.items[0]?.name).toBe('Приём терапевта');
    expect(englishAgain.items[0]?.name).toBe('Therapist appointment');
    expect(fhirClient.search).toHaveBeenCalledTimes(2);
    expect([...store.entries.keys()].sort()).toEqual([CACHE_KEYS.SERVICES_PAGE(1, 20, 'en'), CACHE_KEYS.SERVICES_PAGE(1, 20, 'ru')].sort());
  });

  describe('admin writes', () => {
    const createDto = { name: 'ЭКГ', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '10007', defaultDurationMin: 20 };

    it('should store the English name and description as translation extensions on create', async () => {
      await service.create({ ...createDto, description: 'ЭКГ в покое', nameEn: 'ECG', descriptionEn: 'Resting ECG' }, ACTOR);

      expect(written(fhirClient)['_name']).toEqual({ extension: [translationExtension('en', 'ECG')] });
      expect(written(fhirClient)['_comment']).toEqual({ extension: [translationExtension('en', 'Resting ECG')] });
    });

    it('should write no translation when no English text is given', async () => {
      await service.create(createDto, ACTOR);

      expect(written(fhirClient)).not.toHaveProperty('_name');
      expect(written(fhirClient)).not.toHaveProperty('_comment');
    });

    it('should keep the stored English text when an update leaves it out, replace it when given and drop it when blank', async () => {
      await service.update('s1', { name: 'Новое имя' }, ACTOR);
      expect(written(fhirClient)['_name']).toEqual(stored['_name']);

      fhirClient.batch.mockClear();
      await service.update('s1', { nameEn: 'New name', descriptionEn: '' }, ACTOR);
      expect(written(fhirClient)['_name']).toEqual({ extension: [translationExtension('en', 'New name')] });
      expect(written(fhirClient)).not.toHaveProperty('_comment');
    });
  });
});
