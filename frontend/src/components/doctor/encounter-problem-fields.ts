/**
 * encounter-problem-fields — turns a failed `POST /encounters/{id}/complete` into the form fields to mark.
 *
 * `422 INVALID_ICD10_CODE` and `422 TERMINOLOGY_NOT_FOUND` name the offending codes only inside `detail`
 * (`INVALID_ICD10_CODE: not in <ValueSet>: Z99, A00` / `TERMINOLOGY_NOT_FOUND: not in the terminology seed: <system>#<code>, …`),
 * so the codes are read back from that text and matched to the rows of the form (frontend-design-spec §5.4).
 *
 * This is a contract with the wording of `terminology-validator.service.ts`, pinned by the sample strings in
 * `encounter-problem-fields.spec.ts`. If the wording drifts nothing is matched and the form shows the server's `detail` in the
 * banner with no field marked (never a wrong field). The durable fix is on the server: `details[{ field, message }]` on 422,
 * which `useEncounterForm` already turns into field errors for `VALIDATION_ERROR`.
 */
import type { CompleteEncounterForm } from '@/lib/contracts';
import type { ProblemDetails } from '@/lib/api/problem';

export const ATC_SYSTEM = 'http://www.whocc.no/atc';
export const UCUM_SYSTEM = 'http://unitsofmeasure.org';

export interface FieldAssignment {
  /** react-hook-form path, e.g. `diagnoses.1.code`. */
  readonly path: string;
  /** Key under `doctor.` in the messages catalogue. */
  readonly messageKey: string;
}

/** The comma-separated list after the last `: ` of the server detail, trimmed. */
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

/** Fields to mark for a 422 terminology problem; empty for any other problem or when the codes cannot be matched. */
export function mapProblemToFieldAssignments(problem: ProblemDetails, values: CompleteEncounterForm): ReadonlyArray<FieldAssignment> {
  const items: ReadonlySet<string> = new Set(listedItems(problem.detail));
  if (problem.errorCode === 'INVALID_ICD10_CODE') return icd10Assignments(items, values);
  if (problem.errorCode === 'TERMINOLOGY_NOT_FOUND') return terminologyAssignments(items, values);
  return [];
}

/** Every form path a server `details[].field` may name, so `applyProblemToForm` can tell form fields from foreign ones. */
export function knownFieldPaths(values: CompleteEncounterForm): ReadonlyArray<string> {
  const paths: string[] = ['summary', 'recommendations', 'diagnoses', 'observations', 'serviceRequests', 'medicationRequests'];
  values.diagnoses.forEach((_row, index) => ['code', 'display', 'verificationStatus'].forEach((key) => paths.push(`diagnoses.${index}.${key}`)));
  values.observations.forEach((_row, index) => ['codeSystem', 'code', 'value', 'unit'].forEach((key) => paths.push(`observations.${index}.${key}`)));
  values.serviceRequests.forEach((_row, index) => ['codeSystem', 'code', 'note'].forEach((key) => paths.push(`serviceRequests.${index}.${key}`)));
  values.medicationRequests.forEach((_row, index) => ['atcCode', 'dosageText', 'note'].forEach((key) => paths.push(`medicationRequests.${index}.${key}`)));
  return paths;
}
