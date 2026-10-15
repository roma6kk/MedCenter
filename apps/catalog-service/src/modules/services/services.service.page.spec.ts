import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

/** `GET /services` in the API section 0 envelope: `{ items, meta }` instead of a bare array. */
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
    // Arrange
    fhirClient.search.mockResolvedValue({ ...catalogBundle, total: 45 });

    // Act
    const page = await servicesService.list(2, 20);

    // Assert
    expect(page.items).toEqual([expect.objectContaining({ id: serviceId, name: 'Therapy' })]);
    expect(page.meta).toEqual({ page: 2, pageSize: 20, totalItems: 45, totalPages: 3 });
  });

  it('should count up to the current page when HAPI does not report a total', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue(catalogBundle);

    // Act
    const page = await servicesService.list(3, 10);

    // Assert — 2 earlier pages of 10 plus the 1 row on this page.
    expect(page.meta).toEqual({ page: 3, pageSize: 10, totalItems: 21, totalPages: 3 });
  });

  it('should return an empty envelope when HAPI finds no service', async () => {
    // Arrange
    fhirClient.search.mockResolvedValue({ total: 0 });

    // Act
    const page = await servicesService.list();

    // Assert
    expect(page).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });
});
