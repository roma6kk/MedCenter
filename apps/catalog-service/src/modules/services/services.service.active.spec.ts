import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { committedEntries, transactionResponder } from '../../common/__tests__/audited-transactions';
import { InMemoryCacheStore } from '../cache/__tests__/in-memory-cache-store';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };
const LOOKUP = { resourceType: 'Parameters', parameter: [{ name: 'display', valueString: 'Консультация' }] };

function service(id: string, extra: Record<string, unknown> = {}): FhirResource {
  return { resourceType: 'HealthcareService', id, name: `Услуга ${id}`, ...extra };
}

describe('ServicesService isActive', () => {
  let services: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn().mockResolvedValue({ total: 1, entry: [{ resource: service('a') }] }),
      read: jest.fn(),
      operation: jest.fn().mockResolvedValue(LOOKUP),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    services = new ServicesService(fhirClient, new RedisCacheService());
  });

  const written = (): FhirResource => (committedEntries(fhirClient)[0]?.resource ?? {}) as FhirResource;

  it('should leave a deactivated service out of the public list', async () => {
    await services.list(1, 20);

    expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', expect.objectContaining({ 'active:not': 'false' }));
  });

  it('should leave a deactivated service out of the public search as well', async () => {
    await services.list(1, 20, 'тер');

    expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', expect.objectContaining({ name: 'тер', 'active:not': 'false' }));
  });

  it('should list every service, the deactivated ones too, for the administrator', async () => {
    fhirClient.search.mockResolvedValue({ total: 2, entry: [{ resource: service('a') }, { resource: service('b', { active: false }) }] });

    const page = await services.listAll(1, 20);

    expect(fhirClient.search).toHaveBeenCalledWith('HealthcareService', expect.not.objectContaining({ 'active:not': expect.anything() }));
    expect(page.items.map((item) => [item.id, item.isActive])).toEqual([['a', true], ['b', false]]);
  });

  it('should not cache the administrator list', async () => {
    await services.listAll(1, 20);
    await services.listAll(1, 20);

    expect(fhirClient.search).toHaveBeenCalledTimes(2);
  });

  it('should answer 404 for a deactivated service on the public card', async () => {
    fhirClient.read.mockResolvedValue(service('b', { active: false }));

    await expect(services.findById('b')).rejects.toMatchObject({ upstreamStatus: 404 });
  });

  it('should answer the card of a service without the active element', async () => {
    fhirClient.read.mockResolvedValue(service('a'));

    await expect(services.findById('a')).resolves.toMatchObject({ id: 'a', isActive: true });
  });

  it('should write an active service when create does not say', async () => {
    await services.create({ name: 'Терапия', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '01', defaultDurationMin: 30 }, ACTOR);

    expect(written()['active']).toBe(true);
  });

  it('should write an inactive service when create says isActive false', async () => {
    await services.create({ name: 'Терапия', typeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, typeCode: '01', defaultDurationMin: 30, isActive: false }, ACTOR);

    expect(written()['active']).toBe(false);
  });

  it('should deactivate a service by PATCH and keep it when the PATCH does not mention isActive', async () => {
    fhirClient.read.mockResolvedValue(service('a', { active: true }));

    await services.update('a', { isActive: false }, ACTOR);
    expect(written()['active']).toBe(false);

    fhirClient.batch.mockClear();
    await services.update('a', { name: 'Новое' }, ACTOR);
    expect(written()['active']).toBe(true);
  });

  describe('empty catalogue', () => {
    it('should not keep an empty page in the cache, so the catalogue shows at once after the seed', async () => {
      const store = new InMemoryCacheStore();
      services = new ServicesService(fhirClient, new RedisCacheService(store));
      fhirClient.search.mockResolvedValueOnce({ total: 0, entry: [] });

      const empty = await services.list(1, 20);
      const seeded = await services.list(1, 20);

      expect(empty.items).toEqual([]);
      expect(seeded.items.map((item) => item.id)).toEqual(['a']);
      expect(store.entries.size).toBe(1);
    });
  });
});
