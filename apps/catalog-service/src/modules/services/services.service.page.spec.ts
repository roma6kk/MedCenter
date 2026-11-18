import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

describe('ServicesService.list envelope', () => {
  const serviceId = 'svc-1';
  const catalogBundle = { entry: [{ resource: { resourceType: 'HealthcareService', id: serviceId, name: 'Therapy' } }] };
  let servicesService: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = { search: jest.fn() } as unknown as jest.Mocked<FhirClient>;
    servicesService = new ServicesService(fhirClient, new RedisCacheService());
  });

  it('should wrap the page in the API section 0 envelope when HAPI reports the total', async () => {
    fhirClient.search.mockResolvedValue({ ...catalogBundle, total: 45 });

    const page = await servicesService.list(2, 20);

    expect(page.items).toEqual([expect.objectContaining({ id: serviceId, name: 'Therapy' })]);
    expect(page.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
  });

  it('should count up to the current page when HAPI does not report a total', async () => {
    fhirClient.search.mockResolvedValue(catalogBundle);

    const page = await servicesService.list(3, 10);

    expect(page.meta).toEqual({ page: 3, pageSize: 10, totalItems: 21, totalPages: 3 });
  });

  it('should return an empty envelope when HAPI finds no service', async () => {
    fhirClient.search.mockResolvedValue({ total: 0 });

    const page = await servicesService.list();

    expect(page).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });
});
