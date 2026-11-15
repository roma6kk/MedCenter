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
}

interface StripOptions {
  readonly apply: boolean;
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

function hasNeutralCoding(reason: unknown): boolean {
  const coding = (reason as { coding?: ReadonlyArray<{ system?: unknown }> } | undefined)?.coding ?? [];
  return coding.some((item) => item.system === APPOINTMENT_CANCEL_REASON_SYSTEM);
}

function hasFreeTextCancelReason(appointment: FhirResource): boolean {
  const reason = appointment['cancelationReason'];
  return reason !== undefined && !hasNeutralCoding(reason);
}

export function stripReasonsOf(appointment: FhirResource): FhirResource | undefined {
  if (!hasReasonCode(appointment) && !hasFreeTextCancelReason(appointment)) {
    return undefined;
  }
  const { reasonCode: _removed, ...rest } = appointment;
  return hasFreeTextCancelReason(appointment) ? { ...rest, cancelationReason: NEUTRAL_OTHER } : (rest as FhirResource);
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

async function writeBatch(fhir: FhirHttp, planned: readonly Planned[]): Promise<number> {
  const answer = await fhir.bundle(
    'batch',
    planned.map(({ resource, ifMatch }) => ({
      method: 'PUT' as const,
      url: `Appointment/${resource.id ?? ''}`,
      resource,
      ...(ifMatch === undefined ? {} : { ifMatch }),
    })),
  );
  return planned.filter((_, index) => /^2\d\d/.test(answer.entry?.[index]?.response?.status ?? '')).length;
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
  if (!options.apply) {
    return { ...counts, updated: 0, failed: 0 };
  }
  let updated = 0;
  for (const chunk of chunks(planned, BATCH_CHUNK)) {
    updated += await writeBatch(fhir, chunk);
  }
  return { ...counts, updated, failed: planned.length - updated };
}

if (require.main === module) {
  runMain(async () => {
    loadSeedEnv(join(__dirname, '..', '..'));
    const apply = process.argv.slice(2).includes('--apply');
    const unknown = process.argv.slice(2).filter((argument) => argument !== '--apply');
    if (unknown.length > 0) {
      throw new Error(`Unknown argument "${unknown[0] ?? ''}" (supported: --apply)`);
    }
    const baseUrl = resolveFhirBaseUrl();
    console.log(`${apply ? 'Stripping' : 'Dry run, no writes:'} free-text appointment reasons in ${baseUrl}`);
    const summary = await stripFreeTextReasons(new FhirHttp(baseUrl), { apply });
    console.log(`Appointments scanned: ${summary.scanned}`);
    console.log(`With reasonCode: ${summary.withReasonCode}`);
    console.log(`With cancelationReason without a neutral code: ${summary.withFreeTextCancelReason}`);
    console.log(`Updated: ${summary.updated}, failed: ${summary.failed}`);
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
    if (!apply && summary.withReasonCode + summary.withFreeTextCancelReason > 0) {
      console.log('Re-run with --apply to write.');
    }
  });
}
