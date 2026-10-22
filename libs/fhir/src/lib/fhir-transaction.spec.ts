import { ConflictException } from '@nestjs/common';

import { FhirClientError, type FhirClient } from './fhir-client.provider';
import { commitTransaction, idFromLocation, versionOf } from './fhir-transaction';

function clientAnswering(result: Promise<unknown>): jest.Mocked<FhirClient> {
  return { batch: jest.fn().mockReturnValue(result) } as unknown as jest.Mocked<FhirClient>;
}

describe('commitTransaction', () => {
  it('should send one transaction Bundle with the fullUrl, method, url and If-Match of each write', async () => {
    const fhir = clientAnswering(Promise.resolve({ resourceType: 'Bundle' }));

    await commitTransaction(
      fhir,
      [
        {
          method: 'POST',
          url: 'Consent',
          fullUrl: 'urn:uuid:1',
          resource: { resourceType: 'Consent' },
        },
        {
          method: 'PUT',
          url: 'Consent/c0',
          resource: { resourceType: 'Consent', id: 'c0' },
          ifMatch: 'W/"2"',
        },
      ],
      'CONFLICT',
    );

    expect(fhir.batch).toHaveBeenCalledWith({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:1',
          resource: { resourceType: 'Consent' },
          request: { method: 'POST', url: 'Consent' },
        },
        {
          resource: { resourceType: 'Consent', id: 'c0' },
          request: { method: 'PUT', url: 'Consent/c0', ifMatch: 'W/"2"' },
        },
      ],
    });
  });

  it('should report a HAPI 409/412 as the conflict code given by the caller', async () => {
    const fhir = clientAnswering(
      Promise.reject(new FhirClientError('POST', 'http://hapi/fhir', 412)),
    );

    const error = await commitTransaction(fhir, [], 'CONFLICT').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ errorCode: 'CONFLICT' });
  });

  it('should let any other upstream failure propagate', async () => {
    const fhir = clientAnswering(
      Promise.reject(new FhirClientError('POST', 'http://hapi/fhir', 503)),
    );

    await expect(commitTransaction(fhir, [], 'CONFLICT')).rejects.toBeInstanceOf(FhirClientError);
  });
});

describe('idFromLocation', () => {
  it.each([
    ['Consent/abc/_history/1', 'abc'],
    ['http://hapi:8080/fhir/Consent/77/_history/3', '77'],
    [undefined, ''],
    ['garbage', ''],
  ])('should read the id of %s as %s', (location, id) => {
    expect(idFromLocation(location)).toBe(id);
  });
});

describe('versionOf', () => {
  it('should wrap meta.versionId as a weak ETag', () => {
    expect(versionOf({ resourceType: 'Consent', meta: { versionId: '4' } })).toBe('W/"4"');
  });

  it('should refuse a resource without a version (optimistic lock impossible)', () => {
    expect(() => versionOf({ resourceType: 'Consent', id: 'c1' })).toThrow('meta.versionId');
  });
});
