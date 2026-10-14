import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { createFhirMock, ENCOUNTER_ID, finishedEncounter } from '../encounters/__tests__/encounter.fixtures';
import { HistoryService } from './history.service';

const QUERY = { page: 2, pageSize: 10, sortOrder: 'desc' as const };

function condition(code: string, encounterId = ENCOUNTER_ID): FhirResource {
  return {
    resourceType: 'Condition',
    id: `cond-${code}`,
    encounter: { reference: `Encounter/${encounterId}` },
    code: { coding: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code, display: 'ОРВИ' }] },
  };
}

describe('HistoryService', () => {
  let fhir: jest.Mocked<FhirClient>;
  let service: HistoryService;

  beforeEach(() => {
    fhir = createFhirMock();
    service = new HistoryService(fhir);
  });

  it('should search the finished encounters of the patient newest first with their clinical content', async () => {
    fhir.search.mockResolvedValue({ total: 0, entry: [] });

    await service.historyOf('Patient/pat-1', QUERY);

    expect(fhir.search).toHaveBeenCalledWith('Encounter', {
      patient: 'Patient/pat-1',
      status: 'finished',
      _sort: '-date',
      _count: 10,
      _offset: 10,
      _total: 'accurate',
      _revinclude: ['Condition:encounter', 'ClinicalImpression:encounter', 'CarePlan:encounter'],
    });
  });

  it('should map each encounter to a history item with its primary diagnosis when it has one', async () => {
    const encounter = { ...finishedEncounter, period: { start: '2026-11-02T06:00:00Z', end: '2026-11-02T06:20:00Z' } };
    fhir.search.mockResolvedValue({
      total: 11,
      entry: [
        { resource: encounter },
        { resource: condition('J06.9') },
        { resource: condition('A09', 'other-encounter') },
        { resource: { resourceType: 'ClinicalImpression', id: 'ci-1', encounter: { reference: `Encounter/${ENCOUNTER_ID}` }, summary: 'Итог' } },
        { resource: { resourceType: 'CarePlan', id: 'cp-1', encounter: { reference: `Encounter/${ENCOUNTER_ID}` }, description: 'Покой' } },
      ],
    });

    const page = await service.historyOf('Patient/pat-1', QUERY);

    expect(page.items).toEqual([
      expect.objectContaining({
        id: ENCOUNTER_ID,
        date: '2026-11-02T06:00:00Z',
        endDate: '2026-11-02T06:20:00Z',
        diagnosis: 'J06.9',
        diagnoses: [{ code: 'J06.9', display: 'ОРВИ' }],
        summary: 'Итог',
        recommendations: 'Покой',
        practitionerRoleId: 'role-1',
      }),
    ]);
    expect(page.meta).toEqual({ page: 2, pageSize: 10, totalItems: 11, totalPages: 2 });
  });
});
