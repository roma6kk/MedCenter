import { FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';

import { SpecialtyResolver, UNKNOWN_SPECIALTY } from './specialty.resolver';

const SNOMED = 'http://snomed.info/sct';

function role(id: string, specialty?: ReadonlyArray<Record<string, unknown>>): FhirResource {
  return { resourceType: 'PractitionerRole', id, ...(specialty === undefined ? {} : { specialty }) };
}

const CARDIOLOGY = [{ coding: [{ system: SNOMED, code: '394579002', display: 'Кардиология' }] }];

describe('SpecialtyResolver', () => {
  let fhir: jest.Mocked<FhirClient>;
  let resolver: SpecialtyResolver;

  beforeEach(() => {
    fhir = {
      search: jest.fn().mockResolvedValue({ entry: [] }),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    resolver = new SpecialtyResolver(fhir);
  });

  it('should read the first specialty coding of the PractitionerRole when the event names a role', async () => {
    fhir.read.mockResolvedValue(role('role-1', CARDIOLOGY));

    const specialty = await resolver.resolve('PractitionerRole/role-1');

    expect(fhir.read).toHaveBeenCalledWith('PractitionerRole', 'role-1');
    expect(specialty).toEqual({ system: SNOMED, code: '394579002', display: 'Кардиология' });
  });

  it('should search the roles of a Practitioner when the event names the practitioner itself', async () => {
    fhir.search.mockResolvedValue({ entry: [{ resource: role('r-0') }, { resource: role('r-1', CARDIOLOGY) }] });

    const specialty = await resolver.resolve('Practitioner/doc-7');

    expect(fhir.search).toHaveBeenCalledWith('PractitionerRole', expect.objectContaining({ practitioner: 'Practitioner/doc-7' }));
    expect(specialty.code).toBe('394579002');
  });

  it('should fall back to the concept text when the specialty has no coding', async () => {
    fhir.read.mockResolvedValue(role('role-1', [{ text: 'Терапия' }]));

    const specialty = await resolver.resolve('PractitionerRole/role-1');

    expect(specialty).toEqual({ system: null, code: 'Терапия', display: 'Терапия' });
  });

  it('should report the unknown specialty when the role carries none', async () => {
    fhir.read.mockResolvedValue(role('role-1'));

    expect(await resolver.resolve('PractitionerRole/role-1')).toEqual(UNKNOWN_SPECIALTY);
  });

  it('should report the unknown specialty when HAPI no longer has the role', async () => {
    fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/PractitionerRole/gone', 404));

    expect(await resolver.resolve('PractitionerRole/gone')).toEqual(UNKNOWN_SPECIALTY);
  });

  it('should rethrow when HAPI is unavailable so the delivery is retried instead of mislabelled', async () => {
    fhir.read.mockRejectedValue(new FhirClientError('GET', 'http://hapi/fhir/PractitionerRole/role-1', 503));

    await expect(resolver.resolve('PractitionerRole/role-1')).rejects.toBeInstanceOf(FhirClientError);
  });

  it('should not call HAPI when the reference is neither a role nor a practitioner', async () => {
    expect(await resolver.resolve('Organization/org-1')).toEqual(UNKNOWN_SPECIALTY);
    expect(fhir.read).not.toHaveBeenCalled();
    expect(fhir.search).not.toHaveBeenCalled();
  });
});
