import { Logger } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { toValidation } from '../value-set-parser';
import { findByCanonical } from './canonical-upsert';
import { expansionCodes, findMissingCodes } from './expansion-codes';
import { buildExpansionChecks, buildValueSets, type ExpansionCheck, type SnapshotValueSet } from './snapshot-resources';

/**
 * Proof that an imported snapshot works the way the services use it: every
 * ValueSet `$expand`s to all of its snapshot codes, and `$validate-code`
 * accepts every one of them — the services' own gate (BR-004, BR-009).
 */

export interface ExpansionReport {
  readonly valueSetUrl: string;
  readonly total: number;
  /** Snapshot codes `$expand` did not return. */
  readonly missingCodes: readonly string[];
  /** Snapshot codes `$validate-code` refused. */
  readonly rejectedCodes: readonly string[];
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

/** The snapshot was written to HAPI, but HAPI does not serve it the way the services need. */
export class SnapshotVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotVerificationError';
  }
}

const MIN_EXPANSION_COUNT = 1000;
const logger = new Logger('SnapshotVerifier');

/** `ValueSet/$expand?url=` — the same call the services' terminology guards depend on (BR-004). */
async function expandedCodes(fhir: FhirClient, check: ExpansionCheck): Promise<{ total: number; missing: string[] }> {
  const count = Math.max(MIN_EXPANSION_COUNT, check.expectedCodes.length * 2);
  const expanded = await fhir.operation('ValueSet', '$expand', { url: check.valueSetUrl, count });
  return { total: expansionCodes(expanded).size, missing: findMissingCodes(expanded, check.expectedCodes) };
}

/** Snapshot codes `$validate-code` refuses for the ValueSet. */
export async function findRejectedCodes(fhir: FhirClient, check: ExpansionCheck): Promise<string[]> {
  const rejected: string[] = [];
  for (const concept of check.concepts) {
    const answer = await fhir.operation('ValueSet', '$validate-code', {
      url: check.valueSetUrl,
      system: check.systemUrl,
      code: concept.code,
    });
    if (!toValidation(answer).valid) {
      rejected.push(concept.code);
    }
  }
  return rejected;
}

/**
 * HAPI pre-expands a ValueSet on a schedule and serves that stored expansion
 * afterwards. An expansion computed from an older CodeSystem body stays stale
 * until the ValueSet itself is replaced, so the recovery is delete + re-PUT of
 * the (purely derived) ValueSet — never a wait.
 */
async function recreateValueSet(fhir: FhirClient, valueSet: SnapshotValueSet): Promise<void> {
  for (const existing of await findByCanonical(fhir, 'ValueSet', valueSet.url)) {
    if (existing.id !== undefined) {
      await fhir.delete('ValueSet', existing.id);
    }
  }
  await fhir.update('ValueSet', valueSet.id, valueSet);
  logger.warn({ valueSet: valueSet.url }, 'Recreated ValueSet to drop a stale pre-expansion');
}

async function expandWithRecovery(
  fhir: FhirClient,
  check: ExpansionCheck,
  valueSet: SnapshotValueSet | undefined,
  options: VerifyOptions,
): Promise<{ total: number; missing: string[] }> {
  let result = await expandedCodes(fhir, check);
  for (let attempt = 1; result.missing.length > 0 && attempt < options.attempts; attempt += 1) {
    if (attempt === 1 && valueSet !== undefined) {
      await recreateValueSet(fhir, valueSet);
    } else {
      await options.sleep(options.delayMs);
    }
    result = await expandedCodes(fhir, check);
  }
  return result;
}

function assertVerified(reports: readonly ExpansionReport[]): void {
  const incomplete = reports.filter((report) => report.missingCodes.length > 0);
  if (incomplete.length > 0) {
    const detail = incomplete.map((report) => `${report.valueSetUrl} lacks ${report.missingCodes.join(', ')}`).join('; ');
    throw new SnapshotVerificationError(`ValueSet expansion is incomplete: ${detail}`);
  }
  const refused = reports.filter((report) => report.rejectedCodes.length > 0);
  if (refused.length > 0) {
    const detail = refused.map((report) => `${report.valueSetUrl} rejects ${report.rejectedCodes.join(', ')}`).join('; ');
    throw new SnapshotVerificationError(`$validate-code rejects snapshot codes: ${detail}`);
  }
}

/** Proves every ValueSet of the snapshot; throws {@link SnapshotVerificationError} when one is not served as imported. */
export async function verifySnapshot(
  fhir: FhirClient,
  options: VerifyOptions = DEFAULT_VERIFY_OPTIONS,
): Promise<ExpansionReport[]> {
  const valueSets = buildValueSets();
  const reports: ExpansionReport[] = [];
  for (const check of buildExpansionChecks()) {
    const valueSet = valueSets.find((candidate) => candidate.url === check.valueSetUrl);
    const expanded = await expandWithRecovery(fhir, check, valueSet, options);
    const report: ExpansionReport = {
      valueSetUrl: check.valueSetUrl,
      total: expanded.total,
      missingCodes: expanded.missing,
      rejectedCodes: await findRejectedCodes(fhir, check),
    };
    logger.log(
      { valueSet: report.valueSetUrl, total: report.total, missing: report.missingCodes.length, rejected: report.rejectedCodes.length },
      'ValueSet verified',
    );
    reports.push(report);
  }
  assertVerified(reports);
  return reports;
}
