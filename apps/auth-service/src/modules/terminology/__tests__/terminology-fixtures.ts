import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

export const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
export const ICD10_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';
export const ATC_SYSTEM = 'http://www.whocc.no/atc';

export const EXPANSION: FhirResource = {
  resourceType: 'ValueSet',
  expansion: { total: 1, contains: [{ system: ICD10_SYSTEM, code: 'J06.9', display: 'ОРВИ' }] },
};

export function createFhir(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn().mockResolvedValue({ entry: [] }),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    operation: jest.fn().mockResolvedValue(EXPANSION),
    batch: jest.fn(),
  } as jest.Mocked<FhirClient>;
}

/** The error `FhirClient` raises when HAPI answers a `$expand` with `status`. */
export function upstream(status: number): FhirClientError {
  return new FhirClientError('GET', 'http://hapi/fhir/ValueSet/$expand', status);
}
