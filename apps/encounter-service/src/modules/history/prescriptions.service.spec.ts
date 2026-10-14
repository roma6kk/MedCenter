import type { FhirClient, FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { createFhirMock, ENCOUNTER_ID } from '../encounters/__tests__/encounter.fixtures';
import { PrescriptionsService } from './prescriptions.service';

function medication(id: string): FhirResource {
  return {
    resourceType: 'MedicationRequest',
    id,
    status: 'active',
    authoredOn: '2026-11-02T06:20:00Z',
    encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
    reasonReference: [{ reference: 'Condition/cond-1' }],
    medicationCodeableConcept: { coding: [{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10', display: 'Азитромицин' }] },
    dosageInstruction: [{ text: '1 таб 1 раз в день' }],
  };
}

function serviceRequest(id: string): FhirResource {
  return {
    resourceType: 'ServiceRequest',
    id,
    status: 'active',
    encounter: { reference: `Encounter/${ENCOUNTER_ID}` },
    code: { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10008', display: 'Общий анализ крови' }] },
    note: [{ text: 'Натощак' }],
  };
}

function bundle(total: number, resources: readonly FhirResource[]): { total: number; entry: Array<{ resource: FhirResource }> } {
  return { total, entry: resources.map((resource) => ({ resource })) };
}

describe('PrescriptionsService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: PrescriptionsService;

  beforeEach(() => {
    fhir = createFhirMock();
    service = new PrescriptionsService(fhir);
  });

  it('should fill the page with service requests after the medications when the medications run out', async () => {
    fhir.search
      .mockResolvedValueOnce(bundle(3, [medication('mr-3')]))
      .mockResolvedValueOnce(bundle(4, [serviceRequest('sr-1'), serviceRequest('sr-2')]));

    const page = await service.prescriptionsOf('Patient/pat-1', { page: 2, pageSize: 2, sortOrder: 'desc' });

    expect(fhir.search).toHaveBeenNthCalledWith(1, 'MedicationRequest', expect.objectContaining({
      patient: 'Patient/pat-1',
      _sort: '-authoredon',
      _count: 2,
      _offset: 2,
    }));
    expect(fhir.search).toHaveBeenNthCalledWith(2, 'ServiceRequest', expect.objectContaining({
      patient: 'Patient/pat-1',
      _sort: '-authored',
      _count: 1,
      _offset: 0,
    }));
    expect(page.items.map((item) => item.id)).toEqual(['mr-3', 'sr-1']);
    expect(page.meta).toEqual({ page: 2, pageSize: 2, totalItems: 7, totalPages: 4 });
  });

  it('should only count the service requests when the medications fill the page', async () => {
    fhir.search.mockResolvedValueOnce(bundle(5, [medication('mr-1'), medication('mr-2')])).mockResolvedValueOnce({ total: 1 });

    const page = await service.prescriptionsOf('Patient/pat-1', { page: 1, pageSize: 2, sortOrder: 'desc' });

    expect(fhir.search).toHaveBeenLastCalledWith('ServiceRequest', { patient: 'Patient/pat-1', _summary: 'count' });
    expect(page.meta.totalItems).toBe(6);
  });

  it('should continue in the service requests at the right offset when the page lies past the medications', async () => {
    fhir.search.mockResolvedValueOnce(bundle(3, [])).mockResolvedValueOnce(bundle(10, [serviceRequest('sr-4')]));

    await service.prescriptionsOf('Patient/pat-1', { page: 3, pageSize: 2, sortOrder: 'desc' });

    expect(fhir.search).toHaveBeenLastCalledWith('ServiceRequest', expect.objectContaining({ _count: 2, _offset: 1 }));
  });

  it('should map a medication with its ATC code and dosage and a service request with its НСИ code', async () => {
    fhir.search.mockResolvedValueOnce(bundle(1, [medication('mr-1')])).mockResolvedValueOnce(bundle(1, [serviceRequest('sr-1')]));

    const page = await service.prescriptionsOf('Patient/pat-1', { page: 1, pageSize: 5, sortOrder: 'desc' });

    expect(page.items).toEqual([
      {
        id: 'mr-1',
        kind: 'medication',
        status: 'active',
        authoredOn: '2026-11-02T06:20:00Z',
        encounterId: ENCOUNTER_ID,
        reasonConditionId: 'cond-1',
        atcCode: 'J01FA10',
        atcDisplay: 'Азитромицин',
        dosageText: '1 таб 1 раз в день',
      },
      {
        id: 'sr-1',
        kind: 'service',
        status: 'active',
        encounterId: ENCOUNTER_ID,
        codeSystem: FHIR_BY.SERVICE_CODE_SYSTEM,
        code: '10008',
        display: 'Общий анализ крови',
        note: 'Натощак',
      },
    ]);
  });
});
