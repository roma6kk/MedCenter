import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { expansionCodes } from './expansion-codes';
import { buildExpansionChecks, TERMINOLOGY_URLS, type ExpansionCheck, type SeedConcept } from './terminology-resources';

/**
 * Proof that the seeded terminology works the way the services use it.
 *
 * - `ValueSet/$validate-code` is the services' own gate (BR-004, BR-009,
 *   `TerminologyValidatorService`): every snapshot code must be accepted.
 * - `ValueSet/$expand?filter=` is what a combobox calls. HAPI's in-memory
 *   expansion matches `filter` against the *display* text only (a code such as
 *   `J06.9` is not matched — auth-service's terminology API applies the code
 *   match itself), so the proof filters by the concept's display and checks
 *   that exactly its code comes back.
 */

export interface KeyCode {
  readonly label: string;
  readonly valueSetUrl: string;
  readonly code: string;
}

/** The codes the demo and the encounter flow depend on first. */
export const KEY_CODES: readonly KeyCode[] = [
  { label: 'ICD-10', valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET, code: 'J06.9' },
  { label: 'ATC', valueSetUrl: TERMINOLOGY_URLS.ATC_VALUE_SET, code: 'J01FA10' },
  { label: 'UCUM', valueSetUrl: TERMINOLOGY_URLS.UCUM_VALUE_SET, code: 'Cel' },
];

export interface KeyCodeProof extends KeyCode {
  readonly display: string;
  readonly isValid: boolean;
  /** `$expand?filter=<display>` returned this code. */
  readonly isFoundByFilter: boolean;
  /** Number of concepts the filtered expansion returned (the display should be specific). */
  readonly filterMatches: number;
}

function readValidateResult(parameters: FhirResource): boolean {
  const list = parameters['parameter'];
  if (!Array.isArray(list)) {
    return false;
  }
  const result = (list as ReadonlyArray<{ name?: unknown; valueBoolean?: unknown }>).find(
    (parameter) => parameter.name === 'result',
  );
  return result?.valueBoolean === true;
}

export async function isCodeValid(http: FhirHttp, valueSetUrl: string, system: string, code: string): Promise<boolean> {
  return readValidateResult(await http.operation('ValueSet/$validate-code', { url: valueSetUrl, system, code }));
}

/** Snapshot codes `$validate-code` refuses for the ValueSet. */
export async function findRejectedCodes(http: FhirHttp, check: ExpansionCheck): Promise<string[]> {
  const rejected: string[] = [];
  for (const concept of check.concepts) {
    if (!(await isCodeValid(http, check.valueSetUrl, check.systemUrl, concept.code))) {
      rejected.push(concept.code);
    }
  }
  return rejected;
}

function conceptOf(key: KeyCode): { readonly check: ExpansionCheck; readonly concept: SeedConcept } {
  const check = buildExpansionChecks().find((candidate) => candidate.valueSetUrl === key.valueSetUrl);
  const concept = check?.concepts.find((candidate) => candidate.code === key.code);
  if (check === undefined || concept === undefined) {
    throw new Error(`Key code ${key.code} is not in the snapshot of ${key.valueSetUrl}`);
  }
  return { check, concept };
}

export async function proveKeyCode(http: FhirHttp, key: KeyCode): Promise<KeyCodeProof> {
  const { check, concept } = conceptOf(key);
  const expanded = await http.operation('ValueSet/$expand', { url: key.valueSetUrl, filter: concept.display });
  const codes = expansionCodes(expanded);
  return {
    ...key,
    display: concept.display,
    isValid: await isCodeValid(http, key.valueSetUrl, check.systemUrl, key.code),
    isFoundByFilter: codes.has(key.code),
    filterMatches: codes.size,
  };
}

export async function proveKeyCodes(http: FhirHttp, keys: readonly KeyCode[] = KEY_CODES): Promise<KeyCodeProof[]> {
  const proofs: KeyCodeProof[] = [];
  for (const key of keys) {
    proofs.push(await proveKeyCode(http, key));
  }
  return proofs;
}

export function describeProof(proof: KeyCodeProof): string {
  const state = proof.isValid && proof.isFoundByFilter ? 'OK' : 'FAILED';
  return `${state} ${proof.label} ${proof.code}: $validate-code=${proof.isValid} $expand?filter="${proof.display}" -> ${proof.filterMatches} match(es), found=${proof.isFoundByFilter}`;
}
