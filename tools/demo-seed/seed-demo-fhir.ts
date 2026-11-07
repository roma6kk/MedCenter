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

export interface DemoSeedOptions {
  readonly fromDay: string;
  readonly days: number;
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
  readonly seededCounts: Readonly<Record<string, number>>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRANSACTION_CHUNK = 100;
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
