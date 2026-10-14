import { FhirHttp } from '../shared/fhir-http';
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

/**
 * Local R4 terminology seed (ADR-002/ADR-016, risk R-1): publishes the
 * versioned in-repo snapshot of НСИ ЦИСЗ / МКБ-10 / АТХ / UCUM to HAPI,
 * preserving the canonical URLs, so the stack boots without access to the
 * closed ЦИСЗ perimeter.
 *
 * Idempotent: every resource is written with `PUT` on a deterministic id (or on
 * the id of the copy that already holds its canonical), so a re-run updates in
 * place and never creates a duplicate. The run ends by proving every ValueSet
 * is `$expand`-able and returns each snapshot code, that `$validate-code` accepts
 * every snapshot code (the services' own gate), and that J06.9 / J01FA10 / Cel
 * are found through `$expand?filter=`.
 */

export interface ExpandReport {
  readonly valueSetUrl: string;
  readonly total: number;
  readonly missingCodes: readonly string[];
}

export interface ExpansionReport extends ExpandReport {
  /** Snapshot codes `$validate-code` refused (the services' own gate). */
  readonly rejectedCodes: readonly string[];
}

export interface TerminologySeedSummary {
  readonly upserts: readonly UpsertResult[];
  readonly expansions: readonly ExpansionReport[];
  readonly keyCodes: readonly KeyCodeProof[];
  readonly counts: Readonly<Record<'CodeSystem' | 'ValueSet', number>>;
}

export { expansionCodes, findMissingCodes };

const MIN_EXPANSION_COUNT = 1000;

/** `ValueSet/$expand?url=` — the same call the services' terminology guards depend on (BR-004). */
export async function verifyExpansion(http: FhirHttp, check: ExpansionCheck): Promise<ExpandReport> {
  const count = Math.max(MIN_EXPANSION_COUNT, check.expectedCodes.length * 2);
  const expanded = await http.operation('ValueSet/$expand', { url: check.valueSetUrl, count: String(count) });
  const returned = expansionCodes(expanded);
  return {
    valueSetUrl: check.valueSetUrl,
    total: returned.size,
    missingCodes: findMissingCodes(expanded, check.expectedCodes),
  };
}

/**
 * Plans every resource before writing any: a copy the seed must not touch (a real
 * terminology import, see `isLegacySeedCopy`) stops the run before the first write.
 */
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
  /** Expansion attempts per ValueSet, the first included. */
  readonly attempts: number;
  /** Pause between attempts: HAPI caches resolved CodeSystems for about a minute. */
  readonly delayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_VERIFY_OPTIONS: VerifyOptions = {
  attempts: 6,
  delayMs: 20_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * HAPI pre-expands a ValueSet on a schedule and serves that stored expansion
 * afterwards. An expansion computed from an older CodeSystem body stays stale
 * until the ValueSet itself is replaced, so the recovery is delete + re-PUT of
 * the (purely derived) ValueSet — never a wait. It touches only `ownCopy`, the
 * id this run has just written (the adopted server id, or the deterministic
 * one) — never "whatever else carries the canonical".
 */
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
  let report = await verifyExpansion(http, check);
  for (let attempt = 1; report.missingCodes.length > 0 && attempt < options.attempts; attempt += 1) {
    if (attempt === 1 && ownCopy !== undefined) {
      await recreateValueSet(http, ownCopy);
    } else {
      await options.sleep(options.delayMs);
    }
    report = await verifyExpansion(http, check);
  }
  return report;
}

/** The ValueSet of `check` under the id this run wrote it to (the adopted server id, else the deterministic one). */
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
    const report = { ...expanded, rejectedCodes: await findRejectedCodes(http, check) };
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

async function proveKeys(http: FhirHttp): Promise<KeyCodeProof[]> {
  const proofs = await proveKeyCodes(http);
  proofs.forEach((proof) => console.log(describeProof(proof)));
  const failed = proofs.filter((proof) => !proof.isValid || !proof.isFoundByFilter);
  if (failed.length > 0) {
    throw new Error(`Key codes not provable: ${failed.map((proof) => `${proof.label} ${proof.code}`).join(', ')}`);
  }
  return proofs;
}

/** Upserts every CodeSystem/ValueSet, then proves each ValueSet expands to its snapshot. */
export async function seedTerminology(
  http: FhirHttp,
  options: VerifyOptions = DEFAULT_VERIFY_OPTIONS,
): Promise<TerminologySeedSummary> {
  const upserts = await upsertAll(http);
  const expansions = await verifyAll(http, options, upserts);
  const keyCodes = await proveKeys(http);
  const counts = { CodeSystem: await http.count('CodeSystem'), ValueSet: await http.count('ValueSet') };
  console.log(`Server totals: CodeSystem=${counts.CodeSystem} ValueSet=${counts.ValueSet}`);
  return { upserts, expansions, keyCodes, counts };
}

if (require.main === module) {
  runMain(async () => {
    await seedTerminology(new FhirHttp(resolveFhirBaseUrl()));
  });
}
