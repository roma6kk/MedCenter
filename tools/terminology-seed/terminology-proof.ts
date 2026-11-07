import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { expansionCodes } from './expansion-codes';
import { buildExpansionChecks, TERMINOLOGY_URLS, type ExpansionCheck, type SeedConcept } from './terminology-resources';

export interface KeyCode {
  readonly label: string;
  readonly valueSetUrl: string;
  readonly code: string;
}

export const KEY_CODES: readonly KeyCode[] = [
  { label: 'ICD-10', valueSetUrl: TERMINOLOGY_URLS.ICD10_VALUE_SET, code: 'J06.9' },
  { label: 'ATC', valueSetUrl: TERMINOLOGY_URLS.ATC_VALUE_SET, code: 'J01FA10' },
  { label: 'UCUM', valueSetUrl: TERMINOLOGY_URLS.UCUM_VALUE_SET, code: 'Cel' },
];

export interface KeyCodeProof extends KeyCode {
  readonly display: string;
  readonly isValid: boolean;
  readonly isFoundByFilter: boolean;
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
