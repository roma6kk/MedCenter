import type { FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { displayKey } from '../../terminology/terminology-validator.service';
import { ENCOUNTER_ID, inProgressEncounter, validCompleteDto } from '../__tests__/encounter.fixtures';
import type { CompleteEncounterDto } from '../dto/complete-encounter.dto';
import { buildCompletionPlan, type CompletionContext } from './encounter-completion.mapper';

const NOW = '2026-11-02T06:25:00.000Z';

function contextWith(overrides: Partial<CompletionContext> = {}): CompletionContext {
  let sequence = 0;
  return {
    encounter: inProgressEncounter,
    encounterId: ENCOUNTER_ID,
    patientRef: 'Patient/pat-1',
    practitionerRoleRef: 'PractitionerRole/role-1',
    actorSub: 'doctor-user',
    now: NOW,
    displays: new Map([[displayKey(FHIR_BY.ATC_CODE_SYSTEM, 'J01FA10'), 'Азитромицин']]),
    newFullUrl: () => {
      sequence += 1;
      return `urn:uuid:00000000-0000-4000-8000-00000000000${sequence}`;
    },
    ...overrides,
  };
}

function resourceOf(dto: CompleteEncounterDto, type: string): FhirResource | undefined {
  return buildCompletionPlan(contextWith(), dto).writes.find((write) => write.resource.resourceType === type)?.resource;
}

describe('buildCompletionPlan', () => {
  it('should map the working verification status to the R4 code unconfirmed', () => {
    const dto = { ...validCompleteDto(), diagnoses: [{ code: 'J06.9', display: 'ОРВИ', verificationStatus: 'working' as const }] };

    const condition = resourceOf(dto, 'Condition');

    expect(condition?.['verificationStatus']).toEqual({
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'unconfirmed' }],
    });
    expect(condition?.['category']).toEqual([
      { coding: [expect.objectContaining({ code: 'encounter-diagnosis' })] },
    ]);
  });

  it('should store an observation value as a UCUM quantity', () => {
    const observation = resourceOf(validCompleteDto(), 'Observation');

    expect(observation?.['valueQuantity']).toEqual({ value: 36.6, unit: 'Cel', system: 'http://unitsofmeasure.org', code: 'Cel' });
    expect(observation?.['status']).toBe('final');
  });

  it('should carry the ATC display resolved by the terminology lookup on the medication', () => {
    const medication = resourceOf(validCompleteDto(), 'MedicationRequest');

    expect(medication?.['medicationCodeableConcept']).toEqual({
      coding: [{ system: FHIR_BY.ATC_CODE_SYSTEM, code: 'J01FA10', display: 'Азитромицин' }],
      text: 'Азитромицин',
    });
    expect(medication?.['dosageInstruction']).toEqual([{ text: '1 таб 1 раз в день 3 дня' }]);
  });

  it('should close the encounter period and link its diagnoses when the plan is built', () => {
    const plan = buildCompletionPlan(contextWith(), validCompleteDto());

    expect(plan.finishedEncounter).toMatchObject({
      status: 'finished',
      period: { start: '2026-11-02T06:00:00.000Z', end: NOW },
      diagnosis: [{ condition: { reference: 'urn:uuid:00000000-0000-4000-8000-000000000001' }, rank: 1 }],
      statusHistory: [{ status: 'in-progress', period: { start: '2026-11-02T06:00:00.000Z', end: NOW } }],
    });
  });

  it('should audit the encounter update and the creation of the clinical record separately when the plan is built', () => {
    const plan = buildCompletionPlan(contextWith(), validCompleteDto());
    const audits = plan.writes.filter((write) => write.resource.resourceType === 'AuditEvent').map((write) => write.resource);
    const created = plan.writes.filter((write) => write.method === 'POST' && write.fullUrl !== undefined).map((write) => write.fullUrl);
    const entitiesOf = (audit: FhirResource | undefined): string[] =>
      ((audit?.['entity'] as Array<{ what: { reference: string } }> | undefined) ?? []).map((entity) => entity.what.reference);

    const [update, create] = audits;

    expect(audits).toHaveLength(2);
    expect(update).toMatchObject({ action: 'U', subtype: [{ code: 'update' }] });
    expect(entitiesOf(update)).toEqual([`Encounter/${ENCOUNTER_ID}`, 'Patient/pat-1']);
    expect(create).toMatchObject({ action: 'C', subtype: [{ code: 'create' }] });
    expect(entitiesOf(create)).toEqual([...created, 'Patient/pat-1']);
  });

  it('should reference the observations from the clinical impression investigation', () => {
    const impression = resourceOf(validCompleteDto(), 'ClinicalImpression');

    expect(impression).toMatchObject({
      status: 'completed',
      summary: 'Жалобы на заложенность носа, субфебрилитет',
      finding: [{ itemReference: { reference: 'urn:uuid:00000000-0000-4000-8000-000000000001' } }],
      investigation: [{ item: [{ reference: expect.stringMatching(/^urn:uuid:/) }] }],
    });
  });
});
