import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { translationExtension } from '@medcenter/fhir-mappers';
import { FHIR_BY } from '@medcenter/terminology';

import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { committedEntries, transactionResponder } from '../../common/__tests__/audited-transactions';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };
const LOOKUP = { resourceType: 'Parameters', parameter: [{ name: 'display', valueString: 'Консультация' }] };

/** FHIR JSON forbids an empty string, so no written element may be one. */
function emptyStrings(value: unknown): string[] {
  if (value === '') {
    return [''];
  }
  if (Array.isArray(value)) {
    return value.flatMap(emptyStrings);
  }
  return typeof value === 'object' && value !== null ? Object.values(value).flatMap(emptyStrings) : [];
}

describe('ServicesService description', () => {
  let service: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;
  const stored: FhirResource = {
    resourceType: 'HealthcareService',
    id: 'svc-1',
    name: 'Терапия',
    comment: 'Приём терапевта',
    _comment: { extension: [translationExtension('en', 'Therapist visit')] },
    type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '01' }] }],
  };

  beforeEach(() => {
    fhirClient = {
      search: jest.fn(),
      read: jest.fn().mockResolvedValue(stored),
      operation: jest.fn().mockResolvedValue(LOOKUP),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    service = new ServicesService(fhirClient, new RedisCacheService(new InMemoryCacheStore()));
  });

  const written = (): FhirResource => (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;

  it('should remove the comment and its English text when the PATCH clears the description', async () => {
    await service.update('svc-1', { description: '' }, ACTOR);

    expect(written()['comment']).toBeUndefined();
    expect(written()['_comment']).toBeUndefined();
    expect(emptyStrings(written())).toEqual([]);
  });

  it('should treat a description of spaces as cleared', async () => {
    await service.update('svc-1', { description: '   ' }, ACTOR);

    expect(written()['comment']).toBeUndefined();
    expect(emptyStrings(written())).toEqual([]);
  });

  it('should keep the English text the same PATCH brings when the description is cleared', async () => {
    await service.update('svc-1', { description: '', descriptionEn: 'New English' }, ACTOR);

    expect(written()['comment']).toBeUndefined();
    expect(written()['_comment']).toEqual({ extension: [translationExtension('en', 'New English')] });
  });

  it('should write no comment when a service is created with a blank description', async () => {
    await service.create({ name: 'Терапия', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '01', defaultDurationMin: 30, description: '   ' }, ACTOR);

    expect(written()['comment']).toBeUndefined();
    expect(emptyStrings(written())).toEqual([]);
  });

  describe('concurrent edits', () => {
    it('should write the PUT If-Match the version it read, so an edit made in between is not overwritten', async () => {
      fhirClient.read.mockResolvedValue({ ...stored, meta: { versionId: '4' } });

      await service.update('svc-1', { name: 'Новое' }, ACTOR);

      expect(committedEntries(fhirClient)[0]?.request).toEqual({ method: 'PUT', url: 'HealthcareService/svc-1', ifMatch: 'W/"4"' });
    });

    it('should answer 409 CONFLICT when HAPI refuses the stale version', async () => {
      fhirClient.read.mockResolvedValue({ ...stored, meta: { versionId: '4' } });
      fhirClient.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 412, '{}'));

      await expect(service.update('svc-1', { name: 'Новое' }, ACTOR)).rejects.toMatchObject({ status: 409, response: { errorCode: 'CONFLICT' } });
    });
  });

  describe('typeDisplay', () => {
    const body = { name: 'Терапия', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '01', defaultDurationMin: 30 };

    it('should store the display of the НСИ concept and answer it as typeDisplay when a service is created', async () => {
      const created = await service.create(body, ACTOR);

      expect(written()['type']).toEqual([{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '01', display: 'Консультация' }] }]);
      expect(created.typeDisplay).toBe('Консультация');
    });

    it('should write the coding without a display when the lookup answers none', async () => {
      fhirClient.operation.mockResolvedValue({ resourceType: 'Parameters', parameter: [{ name: 'name', valueString: 'nsi' }] });

      await service.create(body, ACTOR);

      expect(written()['type']).toEqual([{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '01' }] }]);
    });

    it('should replace the display together with the code on a typeCode PATCH', async () => {
      fhirClient.operation.mockResolvedValue({ resourceType: 'Parameters', parameter: [{ name: 'display', valueString: 'Осмотр хирурга' }] });

      const updated = await service.update('svc-1', { typeCode: '02' }, ACTOR);

      expect(updated.typeDisplay).toBe('Осмотр хирурга');
    });

    it('should leave the stored coding, display included, when the PATCH does not touch the type', async () => {
      const withDisplay = { ...stored, type: [{ coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '01', display: 'Старое' }] }] };
      fhirClient.read.mockResolvedValue(withDisplay);

      await service.update('svc-1', { name: 'Новое' }, ACTOR);

      expect(written()['type']).toEqual(withDisplay.type);
      expect(fhirClient.operation).not.toHaveBeenCalled();
    });
  });
});
