import type { Bundle, FhirHttp, FhirResource } from '../shared/fhir-http';

/**
 * `seed:demo -- --repair`: puts right what the stack recorded before BR-008 was enforced.
 *
 * Encounters completed before `e13a59c` left their Appointment `booked`; the encounter-service now writes `fulfilled` in
 * the completion transaction, so such rows never fix themselves. Each one is updated exactly as that transaction does it
 * (`PUT` with `If-Match` on the version read), in a `batch`, so a row someone changed in the meantime fails alone.
 * Leftovers of manual and agent checks are only reported: deleting them is a decision for the owner.
 */

export interface RepairSummary {
  /** Booked appointments with a finished encounter that are now `fulfilled`. */
  readonly fulfilled: readonly string[];
  /** Those whose update was refused (changed since it was read), with the status HAPI answered. */
  readonly failed: ReadonlyArray<{ readonly id: string; readonly status: string }>;
  readonly leftovers: Leftovers;
}

export interface Leftovers {
  /** Inactive schedules: kept because slots and appointments may still point at them. */
  readonly inactiveSchedules: number;
  /** Rooms and services named like a check (`E2E-check…`, `zz-…`). */
  readonly checkResources: readonly string[];
}

/** How a check names what it creates (verify-manual-testing-guide §4.3, agent repros). */
const CHECK_NAME = /^(e2e-check|zz-)/i;
const ID_CHUNK = 50;

function appointmentIdsOf(encounters: readonly FhirResource[]): string[] {
  const ids = new Set<string>();
  for (const encounter of encounters) {
    for (const reference of (encounter['appointment'] as ReadonlyArray<{ reference?: string }> | undefined) ?? []) {
      const match = /^Appointment\/([A-Za-z0-9\-.]{1,64})$/.exec(reference.reference ?? '');
      if (match?.[1] !== undefined) ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function versionTag(resource: FhirResource): string | undefined {
  const versionId = (resource['meta'] as { versionId?: string } | undefined)?.versionId;
  return versionId === undefined ? undefined : `W/"${versionId}"`;
}

async function findStaleBooked(fhir: FhirHttp): Promise<FhirResource[]> {
  const ids = appointmentIdsOf(await fhir.search('Encounter', { status: 'finished', _count: '200' }));
  const stale: FhirResource[] = [];
  for (const chunk of chunks(ids, ID_CHUNK)) stale.push(...(await fhir.search('Appointment', { _id: chunk.join(','), status: 'booked', _count: String(ID_CHUNK) })));
  return stale;
}

async function markFulfilled(fhir: FhirHttp, stale: readonly FhirResource[]): Promise<Pick<RepairSummary, 'fulfilled' | 'failed'>> {
  if (stale.length === 0) return { fulfilled: [], failed: [] };
  const answer: Bundle = await fhir.bundle(
    'batch',
    stale.map((appointment) => {
      const ifMatch = versionTag(appointment);
      return { method: 'PUT', url: `Appointment/${appointment.id ?? ''}`, resource: { ...appointment, status: 'fulfilled' }, ...(ifMatch === undefined ? {} : { ifMatch }) };
    }),
  );
  const fulfilled: string[] = [];
  const failed: Array<{ id: string; status: string }> = [];
  stale.forEach((appointment, index) => {
    const status = answer.entry?.[index]?.response?.status ?? 'none';
    if (/^2\d\d/.test(status)) fulfilled.push(appointment.id ?? '');
    else failed.push({ id: appointment.id ?? '', status });
  });
  return { fulfilled, failed };
}

async function findLeftovers(fhir: FhirHttp): Promise<Leftovers> {
  const inactiveSchedules = await fhir.count('Schedule', { active: 'false' });
  const named = [...(await fhir.search('Location', { _count: '200' })), ...(await fhir.search('HealthcareService', { _count: '200' }))];
  const checkResources = named.filter((resource) => typeof resource['name'] === 'string' && CHECK_NAME.test(resource['name'])).map((resource) => `${resource.resourceType}/${resource.id ?? ''} «${String(resource['name'])}»`);
  return { inactiveSchedules, checkResources };
}

export async function repairDemoData(fhir: FhirHttp): Promise<RepairSummary> {
  const written = await markFulfilled(fhir, await findStaleBooked(fhir));
  return { ...written, leftovers: await findLeftovers(fhir) };
}
