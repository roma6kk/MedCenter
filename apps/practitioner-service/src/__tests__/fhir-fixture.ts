import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

export const ACTOR = { sub: 'admin-1', requestId: 'req-1' };

export const PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';

export const IS_ROOM = { physicalType: { coding: [{ system: PHYSICAL_TYPE_SYSTEM, code: 'ro' }] } };

export function fhirClientMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

export function bundle(...resources: readonly FhirResource[]): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource })) };
}
