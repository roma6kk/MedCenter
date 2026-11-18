import { ConflictException } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import { committedEntries, transactionResponder } from '@medcenter/testing';
import { RedisCacheService } from '../cache/redis-cache.service';
import { ServicesService } from './services.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

describe('ServicesService remove, what pins a service', () => {
  let service: ServicesService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn().mockResolvedValue({ resourceType: 'HealthcareService', id: 'svc-1' }),
      batch: jest.fn().mockImplementation(transactionResponder()),
    } as unknown as jest.Mocked<FhirClient>;
    service = new ServicesService(fhirClient, new RedisCacheService());
  });

  const errorOf = async (): Promise<ConflictException> =>
    service.remove('svc-1', ACTOR).then(
      () => {
        throw new Error('expected the delete to be refused');
      },
      (error: unknown) => error as ConflictException,
    );

  it('should answer SERVICE_IN_USE naming the doctor roles when a role lists the service and no schedule does', async () => {
    fhirClient.search.mockImplementation((type) => Promise.resolve(type === 'PractitionerRole' ? { entry: [{ resource: { resourceType: 'PractitionerRole' } }] } : { entry: [] }));

    const error = await errorOf();

    expect(error.getResponse()).toMatchObject({ errorCode: 'SERVICE_IN_USE', message: expect.stringContaining('doctor role') });
    expect(fhirClient.search).toHaveBeenCalledWith('PractitionerRole', { service: 'HealthcareService/svc-1', _count: 1 });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should answer SERVICE_IN_USE, not a concurrent-change CONFLICT, when HAPI refuses the delete for another reference', async () => {
    fhirClient.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 409, '{}'));

    const error = await errorOf();

    expect(error.getResponse()).toMatchObject({ errorCode: 'SERVICE_IN_USE', message: expect.stringContaining('other resources') });
  });

  it('should let any other failure of the delete through', async () => {
    fhirClient.batch.mockRejectedValue(new FhirClientError('POST', 'http://hapi/fhir', 503, '{}'));

    await expect(service.remove('svc-1', ACTOR)).rejects.toMatchObject({ status: 502 });
  });

  it('should delete a service nothing refers to', async () => {
    await service.remove('svc-1', ACTOR);

    expect(committedEntries(fhirClient).map((entry) => entry.request.method)).toEqual(['DELETE', 'POST']);
  });
});
