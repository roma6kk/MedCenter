import type { Bundle, FhirHttp, FhirResource } from '../shared/fhir-http';
import { SCHEDULES } from './demo-catalog';
import { DEMO_TAG_SEARCH, demoIds } from './demo-ids';
import {
  buildHealthcareServices,
  buildLocations,
  buildOrganization,
  buildPractitionerRoles,
  buildPractitioners,
  buildSchedules,
  scheduleActors,
  windowsOf,
  type Horizon,
} from './demo-resources';
import { buildSlot, expandSlotIntervals } from './demo-slots';

/**
 * FHIR part of the demo seed. Reference data is written with `PUT <type>/<id>`
 * on deterministic ids inside `transaction` Bundles, in dependency order (HAPI
 * enforces referential integrity on write). Slots are *create-if-absent*: a
 * slot that exists is never rewritten, so re-running the seed cannot free a
 * slot a patient has booked in the meantime.
 */

export interface DemoSeedOptions {
  /** First clinic calendar day (Europe/Minsk) of the slot horizon, `YYYY-MM-DD`. */
  readonly fromDay: string;
  /** Number of days to cover, starting at `fromDay`. */
  readonly days: number;
  /** Slots that already started are not created. */
  readonly now: Date;
}

export interface WriteStats {
  readonly created: number;
  readonly updated: number;
}

export interface ScheduleSlotStats {
  readonly scheduleKey: string;
  readonly scheduleId: string;
  readonly planned: number;
  readonly created: number;
}

export interface DemoFhirSummary {
  readonly horizon: Horizon;
  readonly writes: Readonly<Record<string, WriteStats>>;
  readonly slots: readonly ScheduleSlotStats[];
  /** Server-side counts of the seeded (tagged) resources per type. */
  readonly seededCounts: Readonly<Record<string, number>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRANSACTION_CHUNK = 100;
/** Types that carry the demo tag. `Slot` is written exactly as catalog-service writes it, so it is counted via its schedules. */
const TAGGED_TYPES = [
  'Organization',
  'Location',
  'Practitioner',
  'PractitionerRole',
  'HealthcareService',
  'Schedule',
] as const;

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function horizonOf(options: DemoSeedOptions): Horizon {
  return { from: options.fromDay, to: addDays(options.fromDay, options.days - 1) };
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

/** Adds the per-entry outcomes of a transaction response to `stats`; anything but 200/201 is an error. */
function tally(response: Bundle, expected: number, stats: { created: number; updated: number }): void {
  const entries = response.entry ?? [];
  if (entries.length !== expected) {
    throw new Error(`Transaction answered ${entries.length} entries for ${expected} requests`);
  }
  for (const entry of entries) {
    const status = entry.response?.status ?? '';
    if (status.startsWith('201')) {
      stats.created += 1;
    } else if (status.startsWith('200')) {
      stats.updated += 1;
    } else {
      throw new Error(`Unexpected transaction entry status "${status}"`);
    }
  }
}

/** `PUT`s the resources (each carries its deterministic id) in transaction Bundles of at most 100 entries. */
export async function writeResources(http: FhirHttp, resources: readonly FhirResource[]): Promise<WriteStats> {
  const stats = { created: 0, updated: 0 };
  for (const chunk of chunked(resources, TRANSACTION_CHUNK)) {
    const response = await http.bundle(
      'transaction',
      chunk.map((resource) => ({ method: 'PUT' as const, url: `${resource.resourceType}/${resource.id ?? ''}`, resource })),
    );
    tally(response, chunk.length, stats);
  }
  return stats;
}

async function existingSlotIds(http: FhirHttp, scheduleId: string): Promise<ReadonlySet<string>> {
  const slots = await http.search('Slot', { schedule: `Schedule/${scheduleId}`, _elements: 'start', _count: '200' });
  return new Set(slots.map((slot) => slot.id ?? ''));
}

/** Slots the schedule should have over the horizon and has not started yet. */
export function plannedSlots(scheduleKey: string, horizon: Horizon, now: Date): FhirResource[] {
  const schedule = SCHEDULES.find((candidate) => candidate.key === scheduleKey);
  if (schedule === undefined) {
    throw new Error(`Unknown schedule key "${scheduleKey}"`);
  }
  const scheduleId = demoIds.schedule(schedule.key);
  return expandSlotIntervals(horizon.from, horizon.to, windowsOf(schedule), schedule.slotDurationMin)
    .filter((interval) => Date.parse(interval.start) > now.getTime())
    .map((interval) => buildSlot(scheduleId, interval, scheduleActors(schedule)));
}

async function seedSlots(http: FhirHttp, horizon: Horizon, now: Date): Promise<ScheduleSlotStats[]> {
  const results: ScheduleSlotStats[] = [];
  for (const schedule of SCHEDULES) {
    const scheduleId = demoIds.schedule(schedule.key);
    const planned = plannedSlots(schedule.key, horizon, now);
    const existing = await existingSlotIds(http, scheduleId);
    const missing = planned.filter((slot) => !existing.has(slot.id ?? ''));
    const stats = await writeResources(http, missing);
    results.push({ scheduleKey: schedule.key, scheduleId, planned: planned.length, created: stats.created });
  }
  return results;
}

async function countSeeded(http: FhirHttp): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const type of TAGGED_TYPES) {
    counts[type] = await http.count(type, { _tag: DEMO_TAG_SEARCH });
  }
  const schedules = SCHEDULES.map((schedule) => `Schedule/${demoIds.schedule(schedule.key)}`).join(',');
  counts['Slot'] = await http.count('Slot', { schedule: schedules });
  return counts;
}

/**
 * Writes the reference data and the slots; every step is idempotent. The
 * property order below is the dependency order: Organization, then what
 * references it (rooms, doctors, services), then roles, then schedules.
 */
export async function seedDemoFhir(http: FhirHttp, options: DemoSeedOptions): Promise<DemoFhirSummary> {
  const horizon = horizonOf(options);
  const writes: Record<string, WriteStats> = {
    Organization: await writeResources(http, [buildOrganization()]),
    Location: await writeResources(http, buildLocations()),
    Practitioner: await writeResources(http, buildPractitioners()),
    HealthcareService: await writeResources(http, buildHealthcareServices()),
    PractitionerRole: await writeResources(http, buildPractitionerRoles()),
    Schedule: await writeResources(http, buildSchedules(horizon)),
  };
  const slots = await seedSlots(http, horizon, options.now);
  const seededCounts = await countSeeded(http);
  return { horizon, writes, slots, seededCounts };
}
