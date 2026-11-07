import { join } from 'node:path';
import { FhirHttp, FhirHttpError } from '../shared/fhir-http';
import { loadSeedEnv } from '../shared/load-seed-env';
import { resolveFhirBaseUrl, runMain } from '../shared/seed-env';
import { applyUpsert, planUpsert, type CanonicalResource, type UpsertPlan, type UpsertResult } from './canonical-upsert';
import { expansionCodes, findMissingCodes } from './expansion-codes';
import { describeProof, findRejectedCodes, proveKeyCodes, type KeyCodeProof } from './terminology-proof';
import {
  buildCodeSystems,
  buildExpansionChecks,
  buildValueSets,
  type ExpansionCheck,
  type SeedValueSet,
} from './terminology-resources';

interface ExpandReport {
  readonly valueSetUrl: string;
  readonly total: number;
  readonly missingCodes: readonly string[];
}

export interface ExpansionReport extends ExpandReport {
  readonly rejectedCodes: readonly string[];
}

interface TerminologySeedSummary {
  readonly upserts: readonly UpsertResult[];
  readonly expansions: readonly ExpansionReport[];
  readonly keyCodes: readonly KeyCodeProof[];
  readonly counts: Readonly<Record<'CodeSystem' | 'ValueSet', number>>;
}

export { expansionCodes, findMissingCodes };

const MIN_EXPANSION_COUNT = 1000;

async function verifyExpansion(http: FhirHttp, check: ExpansionCheck): Promise<ExpandReport> {
  const count = Math.max(MIN_EXPANSION_COUNT, check.expectedCodes.length * 2);
  const expanded = await http.operation('ValueSet/$expand', { url: check.valueSetUrl, count: String(count) });
  const returned = expansionCodes(expanded);
  return {
    valueSetUrl: check.valueSetUrl,
    total: returned.size,
    missingCodes: findMissingCodes(expanded, check.expectedCodes),
  };
}

async function upsertAll(http: FhirHttp): Promise<UpsertResult[]> {
  // CodeSystems first: a ValueSet that includes a system HAPI does not know yet cannot be expanded.
  const planned: Array<{ readonly resource: CanonicalResource; readonly plan: UpsertPlan }> = [];
  for (const resource of [...buildCodeSystems(), ...buildValueSets()]) {
    planned.push({ resource, plan: await planUpsert(http, resource) });
  }
  const results: UpsertResult[] = [];
  for (const { resource, plan } of planned) {
    const result = await applyUpsert(http, resource, plan);
    console.log(`${result.action.padEnd(7)} ${result.resourceType}/${result.id} ${result.url}`);
    results.push(result);
  }
  return results;
}

export interface VerifyOptions {
  readonly attempts: number;
  // HAPI caches resolved CodeSystems for about a minute.
  readonly delayMs: number;
  readonly serverErrorDelayMs?: number;
  readonly sleep: (ms: number) => Promise<void>;
}

const SERVER_ERROR_RETRIES = 6;
const DEFAULT_SERVER_ERROR_DELAY_MS = 1_000;
const MAX_SERVER_ERROR_PAUSE_MS = 16_000;
const HAPI_NOT_READY_MARKER = 'HAPI-2788';

function isTransient(error: unknown): error is FhirHttpError {
  return error instanceof FhirHttpError && (error.status >= 500 || error.message.includes(HAPI_NOT_READY_MARKER));
}

// HAPI answers 5xx (or HAPI-2788) right after a ValueSet PUT while pre-expansion runs; only those are retried.
async function retryOnServerError<T>(options: VerifyOptions, call: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await call();
    } catch (error) {
      if (!isTransient(error) || retry >= SERVER_ERROR_RETRIES) {
        throw error;
      }
      const pause = Math.min((options.serverErrorDelayMs ?? DEFAULT_SERVER_ERROR_DELAY_MS) * 2 ** retry, MAX_SERVER_ERROR_PAUSE_MS);
      console.log(`HAPI answered ${error.status}, retrying in ${pause} ms (${retry + 1}/${SERVER_ERROR_RETRIES})`);
      await options.sleep(pause);
    }
  }
}

export const DEFAULT_VERIFY_OPTIONS: VerifyOptions = {
  attempts: 6,
  delayMs: 20_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// A stale pre-expansion survives until the ValueSet is replaced, so recover by delete + re-PUT.
async function recreateValueSet(http: FhirHttp, ownCopy: SeedValueSet): Promise<void> {
  await http.delete('ValueSet', ownCopy.id);
  await http.put(ownCopy);
  console.log(`Recreated ValueSet/${ownCopy.id} to drop a stale pre-expansion (${ownCopy.url})`);
}

async function verifyWithRecovery(
  http: FhirHttp,
  check: ExpansionCheck,
  ownCopy: SeedValueSet | undefined,
  options: VerifyOptions,
): Promise<ExpandReport> {
  const expand = (): Promise<ExpandReport> => retryOnServerError(options, () => verifyExpansion(http, check));
  let report = await expand();
  for (let attempt = 1; report.missingCodes.length > 0 && attempt < options.attempts; attempt += 1) {
    if (attempt === 1 && ownCopy !== undefined) {
      await recreateValueSet(http, ownCopy);
    } else {
      await options.sleep(options.delayMs);
    }
    report = await expand();
  }
  return report;
}

function ownCopyOf(valueSets: readonly SeedValueSet[], check: ExpansionCheck, upserts: readonly UpsertResult[]): SeedValueSet | undefined {
  const valueSet = valueSets.find((candidate) => candidate.url === check.valueSetUrl);
  const written = upserts.find((upsert) => upsert.resourceType === 'ValueSet' && upsert.url === check.valueSetUrl);
  return valueSet === undefined ? undefined : { ...valueSet, id: written?.id ?? valueSet.id };
}

async function verifyAll(http: FhirHttp, options: VerifyOptions, upserts: readonly UpsertResult[]): Promise<ExpansionReport[]> {
  const valueSets = buildValueSets();
  const reports: ExpansionReport[] = [];
  for (const check of buildExpansionChecks()) {
    const expanded = await verifyWithRecovery(http, check, ownCopyOf(valueSets, check, upserts), options);
    const report = { ...expanded, rejectedCodes: await retryOnServerError(options, () => findRejectedCodes(http, check)) };
    console.log(
      `$expand ${report.valueSetUrl}: ${report.total} codes, missing: ${report.missingCodes.length}; ` +
        `$validate-code rejected: ${report.rejectedCodes.length}/${check.concepts.length}`,
    );
    reports.push(report);
  }
  assertVerified(reports);
  return reports;
}

function assertVerified(reports: readonly ExpansionReport[]): void {
  const incomplete = reports.filter((report) => report.missingCodes.length > 0);
  if (incomplete.length > 0) {
    const detail = incomplete.map((report) => `${report.valueSetUrl} lacks ${report.missingCodes.join(', ')}`).join('; ');
    throw new Error(`ValueSet expansion is incomplete: ${detail}`);
  }
  const refused = reports.filter((report) => report.rejectedCodes.length > 0);
  if (refused.length > 0) {
    const detail = refused.map((report) => `${report.valueSetUrl} rejects ${report.rejectedCodes.join(', ')}`).join('; ');
    throw new Error(`$validate-code rejects snapshot codes: ${detail}`);
  }
}

async function proveKeys(http: FhirHttp, options: VerifyOptions): Promise<KeyCodeProof[]> {
  const proofs = await retryOnServerError(options, () => proveKeyCodes(http));
  proofs.forEach((proof) => console.log(describeProof(proof)));
  const failed = proofs.filter((proof) => !proof.isValid || !proof.isFoundByFilter);
  if (failed.length > 0) {
    throw new Error(`Key codes not provable: ${failed.map((proof) => `${proof.label} ${proof.code}`).join(', ')}`);
  }
  return proofs;
}

export async function seedTerminology(
  http: FhirHttp,
  options: VerifyOptions = DEFAULT_VERIFY_OPTIONS,
): Promise<TerminologySeedSummary> {
  const upserts = await upsertAll(http);
  const expansions = await verifyAll(http, options, upserts);
  const keyCodes = await proveKeys(http, options);
  const counts = { CodeSystem: await http.count('CodeSystem'), ValueSet: await http.count('ValueSet') };
  console.log(`Server totals: CodeSystem=${counts.CodeSystem} ValueSet=${counts.ValueSet}`);
  return { upserts, expansions, keyCodes, counts };
}

if (require.main === module) {
  runMain(async () => {
    loadSeedEnv(join(__dirname, '..', '..'));
    await seedTerminology(new FhirHttp(resolveFhirBaseUrl()));
  });
}
