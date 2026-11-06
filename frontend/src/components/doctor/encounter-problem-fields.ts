import type { CompleteEncounterForm } from '@/lib/contracts';
import type { ProblemDetails } from '@/lib/api/problem';

export const ATC_SYSTEM = 'http://www.whocc.no/atc';
export const UCUM_SYSTEM = 'http://unitsofmeasure.org';

export interface FieldAssignment {
  readonly path: string;
  readonly messageKey: string;
}

function listedItems(detail: string | undefined): ReadonlyArray<string> {
  if (detail === undefined) return [];
  const at: number = detail.lastIndexOf(': ');
  if (at < 0) return [];
  return detail.slice(at + 2).split(',').map((item) => item.trim()).filter((item) => item !== '');
}

function icd10Assignments(codes: ReadonlySet<string>, values: CompleteEncounterForm): ReadonlyArray<FieldAssignment> {
  return values.diagnoses
    .map((diagnosis, index) => ({ diagnosis, index }))
    .filter(({ diagnosis }) => codes.has(diagnosis.code))
    .map(({ index }) => ({ path: `diagnoses.${index}.code`, messageKey: 'encounter.unknownIcd10' }));
}

function terminologyAssignments(refs: ReadonlySet<string>, values: CompleteEncounterForm): ReadonlyArray<FieldAssignment> {
  const has = (system: string, code: string): boolean => refs.has(`${system}#${code}`);
  const found: FieldAssignment[] = [];
  values.observations.forEach((observation, index) => {
    if (has(observation.codeSystem, observation.code)) found.push({ path: `observations.${index}.code`, messageKey: 'encounter.unknownTerm' });
    if (has(UCUM_SYSTEM, observation.unit)) found.push({ path: `observations.${index}.unit`, messageKey: 'encounter.unknownUnit' });
  });
  values.serviceRequests.forEach((service, index) => {
    if (has(service.codeSystem, service.code)) found.push({ path: `serviceRequests.${index}.code`, messageKey: 'encounter.unknownTerm' });
  });
  values.medicationRequests.forEach((medication, index) => {
    if (has(ATC_SYSTEM, medication.atcCode)) found.push({ path: `medicationRequests.${index}.atcCode`, messageKey: 'encounter.unknownAtc' });
  });
  return found;
}

export function mapProblemToFieldAssignments(problem: ProblemDetails, values: CompleteEncounterForm): ReadonlyArray<FieldAssignment> {
  const items: ReadonlySet<string> = new Set(listedItems(problem.detail));
  if (problem.errorCode === 'INVALID_ICD10_CODE') return icd10Assignments(items, values);
  if (problem.errorCode === 'TERMINOLOGY_NOT_FOUND') return terminologyAssignments(items, values);
  return [];
}

export function knownFieldPaths(values: CompleteEncounterForm): ReadonlyArray<string> {
  const paths: string[] = ['summary', 'recommendations', 'diagnoses', 'observations', 'serviceRequests', 'medicationRequests'];
  values.diagnoses.forEach((_row, index) => ['code', 'display', 'verificationStatus'].forEach((key) => paths.push(`diagnoses.${index}.${key}`)));
  values.observations.forEach((_row, index) => ['codeSystem', 'code', 'value', 'unit'].forEach((key) => paths.push(`observations.${index}.${key}`)));
  values.serviceRequests.forEach((_row, index) => ['codeSystem', 'code', 'note'].forEach((key) => paths.push(`serviceRequests.${index}.${key}`)));
  values.medicationRequests.forEach((_row, index) => ['atcCode', 'dosageText', 'note'].forEach((key) => paths.push(`medicationRequests.${index}.${key}`)));
  return paths;
}
