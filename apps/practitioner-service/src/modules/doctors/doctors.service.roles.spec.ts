import type { FhirClient, FhirResource, FhirSearchResult } from '@medcenter/fhir';

import { DoctorsService } from './doctors.service';

const SNOMED = 'http://snomed.info/sct';

function practitioner(id: string, specialty?: { code: string; display: string; text: string }): FhirResource {
  return {
    resourceType: 'Practitioner',
    id,
    name: [{ family: `Doctor${id}`, given: ['Ivan'] }],
    ...(specialty === undefined
      ? {}
      : { qualification: [{ code: { coding: [{ system: SNOMED, code: specialty.code, display: specialty.display }], text: specialty.text } }] }),
  };
}

function role(id: string, practitionerId: string, active?: boolean): FhirResource {
  return {
    resourceType: 'PractitionerRole',
    id,
    practitioner: { reference: `Practitioner/${practitionerId}` },
    ...(active === undefined ? {} : { active }),
  };
}

function bundle(...resources: FhirResource[]): FhirSearchResult {
  return { entry: resources.map((resource) => ({ resource })) };
}

describe('DoctorsService practitioner roles', () => {
  let service: DoctorsService;
  let fhir: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhir = {
      search: jest.fn(),
      read: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;
    service = new DoctorsService(fhir);
  });

  it('should list the role ids of every doctor of the page from one extra PractitionerRole search', async () => {
    fhir.search
      .mockResolvedValueOnce({ total: 2, entry: [{ resource: practitioner('101') }, { resource: practitioner('102') }] })
      .mockResolvedValueOnce(bundle(role('r2', '101'), role('r1', '101'), role('r3', '102')));

    const result = await service.list({});

    expect(fhir.search).toHaveBeenCalledTimes(2);
    expect(fhir.search).toHaveBeenNthCalledWith(2, 'PractitionerRole', { practitioner: 'Practitioner/101,Practitioner/102', _count: 200 });
    expect(result.items.map((doctor) => [doctor.id, doctor.practitionerRoleIds])).toEqual([
      ['101', ['r1', 'r2']],
      ['102', ['r3']],
    ]);
  });

  it('should list every role of a doctor, not only the ones that matched the filter, when the catalog is filtered', async () => {
    fhir.search
      .mockResolvedValueOnce(bundle(role('r1', '101')))
      .mockResolvedValueOnce(bundle(practitioner('101')))
      .mockResolvedValueOnce(bundle(role('r1', '101'), role('r9', '101')));

    const result = await service.list({ specialty: '419192003' });

    expect(fhir.search).toHaveBeenNthCalledWith(1, 'PractitionerRole', expect.objectContaining({ specialty: '419192003' }));
    expect(result.items[0]?.practitionerRoleIds).toEqual(['r1', 'r9']);
  });

  it('should leave a deactivated role out of the role ids', async () => {
    fhir.search
      .mockResolvedValueOnce({ entry: [{ resource: practitioner('101') }] })
      .mockResolvedValueOnce(bundle(role('r1', '101', true), role('r2', '101', false), role('r3', '101')));

    const result = await service.list({});

    expect(result.items[0]?.practitionerRoleIds).toEqual(['r1', 'r3']);
  });

  it('should answer an empty role list for a doctor without roles', async () => {
    fhir.search.mockResolvedValueOnce({ entry: [{ resource: practitioner('101') }] }).mockResolvedValueOnce({ entry: [] });

    const result = await service.list({});

    expect(result.items[0]?.practitionerRoleIds).toEqual([]);
  });

  it('should skip the role search when the page holds no doctor', async () => {
    fhir.search.mockResolvedValue({ entry: [] });

    const result = await service.list({ search: 'nobody' });

    expect(fhir.search).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
  });

  it('should add the specialty token and the role ids to a doctor read by id', async () => {
    fhir.read.mockResolvedValue(practitioner('101', { code: '419192003', display: 'Терапия', text: 'Терапевт' }));
    fhir.search.mockResolvedValue(bundle(role('r1', '101')));

    const doctor = await service.findById('101');

    expect(fhir.search).toHaveBeenCalledWith('PractitionerRole', { practitioner: 'Practitioner/101', _count: 200 });
    expect(doctor).toMatchObject({
      id: '101',
      specialty: 'Терапевт',
      specialtyCode: '419192003',
      specialtySystem: SNOMED,
      practitionerRoleIds: ['r1'],
    });
  });
});
