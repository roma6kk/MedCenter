import type { FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { APPOINTMENT_ID, ENCOUNTER_ID, finishedEncounter, inProgressEncounter } from '../__tests__/encounter.fixtures';
import { toEncounterDetails, toEncounterResponse } from './encounter-view.mapper';

const ENCOUNTER_REF = { reference: `Encounter/${ENCOUNTER_ID}` };

function condition(id: string, code: string): FhirResource {
  return {
    resourceType: 'Condition',
    id,
    encounter: ENCOUNTER_REF,
    code: { coding: [{ system: 'https://fhir.by/CodeSystem/InternClassificDiseases10', code, display: `Диагноз ${code}` }] },
  };
}

const rankedEncounter: FhirResource = {
  ...finishedEncounter,
  period: { start: '2026-11-02T06:00:00Z', end: '2026-11-02T06:20:00Z' },
  diagnosis: [
    { condition: { reference: 'Condition/cond-b' }, rank: 1 },
    { condition: { reference: 'Condition/cond-a' }, rank: 2 },
  ],
};

describe('toEncounterResponse', () => {
  it('should expose bare ids of the appointment, patient and practitioner role when the encounter has them', () => {
    const response = toEncounterResponse(inProgressEncounter, []);

    expect(response).toEqual({
      id: ENCOUNTER_ID,
      status: 'in-progress',
      period: { start: '2026-11-02T06:00:00.000Z' },
      diagnosisCodes: [],
      appointmentId: APPOINTMENT_ID,
      patientId: 'pat-1',
      practitionerRoleId: 'role-1',
    });
  });

  it('should report the status unknown when the stored status is not an R4 encounter status', () => {
    expect(toEncounterResponse({ ...inProgressEncounter, status: 'bogus' }, []).status).toBe('unknown');
  });
});

describe('toEncounterDetails', () => {
  it('should order the diagnoses by Encounter.diagnosis rank when the encounter ranks them', () => {
    const details = toEncounterDetails(rankedEncounter, [condition('cond-a', 'I10'), condition('cond-b', 'J06.9')]);

    expect(details.diagnosisCodes).toEqual(['J06.9', 'I10']);
  });

  it('should return the clinical content in the field names of CompleteEncounterDto', () => {
    const related: FhirResource[] = [
      condition('cond-b', 'J06.9'),
      {
        resourceType: 'Observation',
        id: 'obs-1',
        encounter: ENCOUNTER_REF,
        code: { coding: [{ system: FHIR_BY.OBSERVATION_CODE_SYSTEM, code: '20006', display: 'Температура тела' }] },
        valueQuantity: { value: 36.6, unit: 'Cel', system: FHIR_BY.UCUM_SYSTEM, code: 'Cel' },
      },
      {
        resourceType: 'MedicationRequest',
        id: 'mr-1',
        encounter: ENCOUNTER_REF,
        medicationCodeableConcept: { coding: [{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10', display: 'Азитромицин' }] },
        dosageInstruction: [{ text: '1 таб 1 раз в день' }],
        note: [{ text: 'После еды' }],
      },
      { resourceType: 'ServiceRequest', id: 'sr-1', encounter: ENCOUNTER_REF, code: { coding: [{ system: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10008' }] } },
      { resourceType: 'CarePlan', id: 'cp-1', encounter: ENCOUNTER_REF, description: 'Покой' },
    ];

    const details = toEncounterDetails(rankedEncounter, related);

    expect(details).toMatchObject({
      recommendations: 'Покой',
      observations: [{ codeSystem: FHIR_BY.OBSERVATION_CODE_SYSTEM, code: '20006', value: 36.6, unit: 'Cel' }],
      medicationRequests: [{ atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 1 раз в день', note: 'После еды' }],
      serviceRequests: [{ codeSystem: FHIR_BY.SERVICE_CODE_SYSTEM, code: '10008' }],
    });
  });

  it('should ignore resources that belong to another encounter', () => {
    const foreign = { ...condition('cond-x', 'A09'), encounter: { reference: 'Encounter/other' } };

    expect(toEncounterDetails(rankedEncounter, [foreign]).diagnoses).toEqual([]);
  });
});
