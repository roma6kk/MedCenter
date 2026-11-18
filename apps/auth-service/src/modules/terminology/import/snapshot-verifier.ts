import { Logger } from '@nestjs/common';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';

import { toValidation } from '../value-set-parser';
import { findByCanonical } from './canonical-upsert';
import { expansionCodes, findMissingCodes } from './expansion-codes';
import { buildExpansionChecks, buildValueSets, type ExpansionCheck, type SnapshotValueSet } from './snapshot-resources';

export interface ExpansionReport {
  readonly valueSetUrl: string;
  readonly total: number;
  readonly missingCodes: readonly string[];
  readonly rejectedCodes: readonly string[];
}

export interface VerifyOptions {
  readonly attempts: number;
  /** Pause between attempts: HAPI caches resolved CodeSystems for about a minute. */
  readonly delayMs: number;
  readonly serverErrorDelayMs?: number;
  readonly sleep: (ms: number) => Promise<void>;
}

export const DEFAULT_VERIFY_OPTIONS: VerifyOptions = {
  attempts: 6,
  delayMs: 20_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class SnapshotVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotVerificationError';
  }
}

const MIN_EXPANSION_COUNT = 1000;
const logger = new Logger('SnapshotVerifier');

const SERVER_ERROR_RETRIES = 8;
const DEFAULT_SERVER_ERROR_DELAY_MS = 1_000;
const MAX_SERVER_ERROR_PAUSE_MS = 16_000;
/** HAPI answers this (with any status) while a ValueSet it has just stored is not resolvable yet. */
const HAPI_NOT_READY_MARKER = 'HAPI-2788';

function isTransient(error: unknown): error is FhirClientError {
  return (
    error instanceof FhirClientError &&
    ((error.upstreamStatus !== undefined && error.upstreamStatus >= 500) || (error.body ?? '').includes(HAPI_NOT_READY_MARKER))
  );
}

async function retryOnServerError<T>(options: VerifyOptions, call: () => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await call();
    } catch (error: unknown) {
      if (!isTransient(error) || retry >= SERVER_ERROR_RETRIES) {
        throw error;
      }
      const pause = Math.min((options.serverErrorDelayMs ?? DEFAULT_SERVER_ERROR_DELAY_MS) * 2 ** retry, MAX_SERVER_ERROR_PAUSE_MS);
      logger.warn({ status: error.upstreamStatus, retry: retry + 1, pauseMs: pause }, 'HAPI answered a server error; retrying');
      await options.sleep(pause);
    }
  }
}

async function expandedCodes(
  fhir: FhirClient,
  check: ExpansionCheck,
  options: VerifyOptions,
): Promise<{ total: number; missing: string[] }> {
  const count = Math.max(MIN_EXPANSION_COUNT, check.expectedCodes.length * 2);
  const expanded = await retryOnServerError(options, () => fhir.operation('ValueSet', '$expand', { url: check.valueSetUrl, count }));
  return { total: expansionCodes(expanded).size, missing: findMissingCodes(expanded, check.expectedCodes) };
}

export async function findRejectedCodes(
  fhir: FhirClient,
  check: ExpansionCheck,
  options: VerifyOptions = DEFAULT_VERIFY_OPTIONS,
): Promise<string[]> {
  const rejected: string[] = [];
  for (const concept of check.concepts) {
    const answer = await retryOnServerError(options, () =>
      fhir.operation('ValueSet', '$validate-code', {
        url: check.valueSetUrl,
        system: check.systemUrl,
        code: concept.code,
      }),
    );
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
  let result = await expandedCodes(fhir, check, options);
  for (let attempt = 1; result.missing.length > 0 && attempt < options.attempts; attempt += 1) {
    if (attempt === 1 && valueSet !== undefined) {
      await recreateValueSet(fhir, valueSet);
    } else {
      await options.sleep(options.delayMs);
    }
    result = await expandedCodes(fhir, check, options);
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
      rejectedCodes: await findRejectedCodes(fhir, check, options),
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
