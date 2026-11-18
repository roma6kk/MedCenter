import { join } from 'node:path';

import { APPOINTMENT_CANCEL_REASON_SYSTEM } from '@medcenter/contracts';

import { FhirHttp, type FhirResource } from '../shared/fhir-http';
import { loadSeedEnv } from '../shared/load-seed-env';
import { resolveFhirBaseUrl, runMain } from '../shared/seed-env';

export interface StripSummary {
  readonly scanned: number;
  readonly withReasonCode: number;
  readonly withFreeTextCancelReason: number;
  readonly updated: number;
  readonly failed: number;
  readonly wouldExpunge: number;
  readonly expunged: number;
  readonly expungeFailed: number;
}

interface StripOptions {
  readonly apply: boolean;
  // also clears the history of appointments that were stripped by an earlier run without expunging
  readonly expungeHistory?: boolean;
}

interface Planned {
  readonly resource: FhirResource;
  readonly ifMatch: string | undefined;
}

const PAGE_SIZE = '200';
const BATCH_CHUNK = 50;
const NEUTRAL_OTHER = { coding: [{ system: APPOINTMENT_CANCEL_REASON_SYSTEM, code: 'other' }] };

function hasReasonCode(appointment: FhirResource): boolean {
  return appointment['reasonCode'] !== undefined;
}

type Coding = { readonly system?: unknown; readonly code?: unknown };

// Keeps only the neutral codes of a cancelationReason, without display or text; no neutral code left means "other".
function neutralCancelReason(reason: unknown): unknown {
  const coding = ((reason as { coding?: readonly Coding[] } | undefined)?.coding ?? []).filter((item) => item.system === APPOINTMENT_CANCEL_REASON_SYSTEM);
  return coding.length === 0 ? NEUTRAL_OTHER : { coding: coding.map(({ system, code }) => ({ system, code })) };
}

function hasFreeTextCancelReason(appointment: FhirResource): boolean {
  const reason = appointment['cancelationReason'];
  return reason !== undefined && JSON.stringify(reason) !== JSON.stringify(neutralCancelReason(reason));
}

export function stripReasonsOf(appointment: FhirResource): FhirResource | undefined {
  if (!hasReasonCode(appointment) && !hasFreeTextCancelReason(appointment)) {
    return undefined;
  }
  const { reasonCode: _removed, ...rest } = appointment;
  return hasFreeTextCancelReason(appointment) ? { ...rest, cancelationReason: neutralCancelReason(appointment['cancelationReason']) } : (rest as FhirResource);
}

function versionOf(resource: FhirResource): number {
  return Number((resource['meta'] as { versionId?: string } | undefined)?.versionId ?? '1');
}

function ifMatchOf(resource: FhirResource): string | undefined {
  const versionId = (resource['meta'] as { versionId?: string } | undefined)?.versionId;
  return versionId === undefined ? undefined : `W/"${versionId}"`;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function writeBatch(fhir: FhirHttp, planned: readonly Planned[]): Promise<Planned[]> {
  const answer = await fhir.bundle(
    'batch',
    planned.map(({ resource, ifMatch }) => ({
      method: 'PUT' as const,
      url: `Appointment/${resource.id ?? ''}`,
      resource,
      ...(ifMatch === undefined ? {} : { ifMatch }),
    })),
  );
  return planned.filter((_, index) => /^2\d\d/.test(answer.entry?.[index]?.response?.status ?? ''));
}

async function expungeAll(fhir: FhirHttp, ids: readonly string[]): Promise<{ expunged: number; expungeFailed: number }> {
  let expunged = 0;
  for (const id of ids) {
    try {
      await fhir.expungePreviousVersions('Appointment', id);
      expunged += 1;
    } catch {
      // counted below; the summary carries only counts, never the server's answer
    }
  }
  return { expunged, expungeFailed: ids.length - expunged };
}

export async function stripFreeTextReasons(fhir: FhirHttp, options: StripOptions): Promise<StripSummary> {
  const appointments = await fhir.search('Appointment', { _count: PAGE_SIZE });
  const planned: Planned[] = [];
  for (const appointment of appointments) {
    const stripped = stripReasonsOf(appointment);
    if (stripped !== undefined) {
      planned.push({ resource: stripped, ifMatch: ifMatchOf(appointment) });
    }
  }
  const counts = {
    scanned: appointments.length,
    withReasonCode: appointments.filter(hasReasonCode).length,
    withFreeTextCancelReason: appointments.filter(hasFreeTextCancelReason).length,
  };
  const idOf = (resource: FhirResource): string => resource.id ?? '';
  const olderVersionsOnly = options.expungeHistory === true ? appointments.filter((appointment) => stripReasonsOf(appointment) === undefined && versionOf(appointment) > 1).map(idOf) : [];
  if (!options.apply) {
    return { ...counts, updated: 0, failed: 0, wouldExpunge: planned.length + olderVersionsOnly.length, expunged: 0, expungeFailed: 0 };
  }
  const written: Planned[] = [];
  for (const chunk of chunks(planned, BATCH_CHUNK)) {
    written.push(...(await writeBatch(fhir, chunk)));
  }
  const expunge = await expungeAll(fhir, [...written.map(({ resource }) => idOf(resource)), ...olderVersionsOnly]);
  return { ...counts, updated: written.length, failed: planned.length - written.length, wouldExpunge: 0, ...expunge };
}

if (require.main === module) {
  runMain(async () => {
    loadSeedEnv(join(__dirname, '..', '..'));
    const apply = process.argv.slice(2).includes('--apply');
    const expungeHistory = process.argv.slice(2).includes('--expunge-history');
    const unknown = process.argv.slice(2).filter((argument) => argument !== '--apply' && argument !== '--expunge-history');
    if (unknown.length > 0) {
      throw new Error(`Unknown argument "${unknown[0] ?? ''}" (supported: --apply, --expunge-history)`);
    }
    const baseUrl = resolveFhirBaseUrl();
    console.log(`${apply ? 'Stripping' : 'Dry run, no writes:'} free-text appointment reasons in ${baseUrl}`);
    const summary = await stripFreeTextReasons(new FhirHttp(baseUrl), { apply, expungeHistory });
    console.log(`Appointments scanned: ${summary.scanned}`);
    console.log(`With reasonCode: ${summary.withReasonCode}`);
    console.log(`With cancelationReason without a neutral code: ${summary.withFreeTextCancelReason}`);
    console.log(`Updated: ${summary.updated}, failed: ${summary.failed}`);
    console.log(apply ? `Old versions expunged: ${summary.expunged}, failed: ${summary.expungeFailed}` : `Would expunge old versions of: ${summary.wouldExpunge}`);
    if (summary.failed > 0 || summary.expungeFailed > 0) {
      process.exitCode = 1;
    }
    if (!apply && summary.withReasonCode + summary.withFreeTextCancelReason > 0) {
      console.log('Re-run with --apply to write.');
    }
  });
}
