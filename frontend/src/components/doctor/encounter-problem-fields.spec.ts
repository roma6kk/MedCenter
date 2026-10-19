import type { CompleteEncounterForm } from '@/lib/contracts';
import type { ProblemDetails } from '@/lib/api/problem';
import { ATC_SYSTEM, knownFieldPaths, mapProblemToFieldAssignments, UCUM_SYSTEM } from './encounter-problem-fields';

const OBSERVATION_SYSTEM = 'https://fhir.by/CodeSystem/nsi-observations';
const SERVICE_SYSTEM = 'https://fhir.by/CodeSystem/nsi-services';

const VALUES: CompleteEncounterForm = {
  summary: 'ОРВИ',
  recommendations: 'Покой',
  diagnoses: [
    { code: 'J06.9', display: 'ОРВИ' },
    { code: 'Z99', display: 'Другое' },
  ],
  observations: [{ codeSystem: OBSERVATION_SYSTEM, code: '8310-5', value: 36.6, unit: 'Cel' }],
  serviceRequests: [{ codeSystem: SERVICE_SYSTEM, code: 'SRV-1' }],
  medicationRequests: [{ atcCode: 'J01FA10', dosageText: '1 таб 3 раза в день' }],
};

function problemOf(errorCode: ProblemDetails['errorCode'], detail?: string): ProblemDetails {
  return { title: errorCode, status: 422, errorCode, ...(detail === undefined ? {} : { detail }) };
}

describe('mapProblemToFieldAssignments', () => {
  it('should mark the diagnosis row whose code the server rejected when INVALID_ICD10_CODE names it', () => {
    const problem = problemOf('INVALID_ICD10_CODE', 'INVALID_ICD10_CODE: not in https://fhir.by/ValueSet/InternClassificDiseases10: Z99');

    expect(mapProblemToFieldAssignments(problem, VALUES)).toEqual([{ path: 'diagnoses.1.code', messageKey: 'encounter.unknownIcd10' }]);
  });

  it('should mark every row that carries one of several rejected ICD-10 codes', () => {
    const problem = problemOf('INVALID_ICD10_CODE', 'INVALID_ICD10_CODE: not in the value set: J06.9, Z99');

    expect(mapProblemToFieldAssignments(problem, VALUES).map((item) => item.path)).toEqual(['diagnoses.0.code', 'diagnoses.1.code']);
  });

  it('should mark the ATC field when TERMINOLOGY_NOT_FOUND names the system and code', () => {
    const problem = problemOf('TERMINOLOGY_NOT_FOUND', `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${ATC_SYSTEM}#J01FA10`);

    expect(mapProblemToFieldAssignments(problem, VALUES)).toEqual([{ path: 'medicationRequests.0.atcCode', messageKey: 'encounter.unknownAtc' }]);
  });

  it('should mark the UCUM unit and the observation code when both are unknown to the terminology', () => {
    const problem = problemOf('TERMINOLOGY_NOT_FOUND', `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${UCUM_SYSTEM}#Cel, ${OBSERVATION_SYSTEM}#8310-5`);

    expect(mapProblemToFieldAssignments(problem, VALUES).map((item) => item.path)).toEqual(['observations.0.code', 'observations.0.unit']);
  });

  it('should mark the ordered service when TERMINOLOGY_NOT_FOUND names its code', () => {
    const problem = problemOf('TERMINOLOGY_NOT_FOUND', `TERMINOLOGY_NOT_FOUND: not in the terminology seed: ${SERVICE_SYSTEM}#SRV-1`);

    expect(mapProblemToFieldAssignments(problem, VALUES)).toEqual([{ path: 'serviceRequests.0.code', messageKey: 'encounter.unknownTerm' }]);
  });

  it('should return nothing when the code in the detail matches no row of the form', () => {
    const problem = problemOf('INVALID_ICD10_CODE', 'INVALID_ICD10_CODE: not in the value set: Q99');

    expect(mapProblemToFieldAssignments(problem, VALUES)).toEqual([]);
  });

  it.each([
    ['the list is no longer introduced by a colon', 'INVALID_ICD10_CODE - not in the value set - Z99'],
    ['the codes are joined with a semicolon', 'INVALID_ICD10_CODE: not in the value set: J06.9; Z99'],
  ])('should mark nothing instead of a wrong row when %s', (_case, detail) => {
    const problem = problemOf('INVALID_ICD10_CODE', detail);

    expect(mapProblemToFieldAssignments(problem, VALUES)).toEqual([]);
  });

  it('should return nothing when the problem has no detail', () => {
    expect(mapProblemToFieldAssignments(problemOf('INVALID_ICD10_CODE'), VALUES)).toEqual([]);
  });

  it('should return nothing when the error is not a terminology one', () => {
    expect(mapProblemToFieldAssignments(problemOf('INTERNAL', 'boom: J06.9'), VALUES)).toEqual([]);
  });
});

describe('knownFieldPaths', () => {
  it('should list the nested paths of every row of the form', () => {
    const paths = knownFieldPaths(VALUES);

    expect(paths).toEqual(expect.arrayContaining(['summary', 'diagnoses.1.code', 'observations.0.unit', 'serviceRequests.0.note', 'medicationRequests.0.dosageText']));
    expect(paths).not.toContain('diagnoses.2.code');
  });
});
