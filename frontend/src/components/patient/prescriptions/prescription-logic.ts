import type { Prescription } from '../patient-types';

export type StatusBucket = 'active' | 'closed' | 'other';
export type StatusFilter = 'active' | 'closed' | 'all';

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'revoked', 'stopped', 'entered-in-error']);

export function statusBucket(status: string): StatusBucket {
  if (status === 'active') return 'active';
  return CLOSED_STATUSES.has(status) ? 'closed' : 'other';
}

export function filterByStatus(items: ReadonlyArray<Prescription>, filter: StatusFilter): ReadonlyArray<Prescription> {
  if (filter === 'all') return items;
  return items.filter((item) => statusBucket(item.status) === filter);
}

export interface PrescriptionGroup {
  readonly encounterId: string | null;
  readonly date: string | undefined;
  readonly items: ReadonlyArray<Prescription>;
}

function earliest(items: ReadonlyArray<Prescription>): string | undefined {
  const dates: string[] = items.flatMap((item) => (item.authoredOn === undefined ? [] : [item.authoredOn]));
  return dates.length === 0 ? undefined : dates.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
}

export function groupByEncounter(items: ReadonlyArray<Prescription>): ReadonlyArray<PrescriptionGroup> {
  const byEncounter = new Map<string, Prescription[]>();
  const loose: Prescription[] = [];
  for (const item of items) {
    if (item.encounterId === undefined || item.encounterId === '') {
      loose.push(item);
      continue;
    }
    byEncounter.set(item.encounterId, [...(byEncounter.get(item.encounterId) ?? []), item]);
  }
  const groups: PrescriptionGroup[] = [...byEncounter].map(([encounterId, members]) => ({ encounterId, date: earliest(members), items: members }));
  groups.sort((a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? '') || 0);
  return loose.length === 0 ? groups : [...groups, { encounterId: null, date: undefined, items: loose }];
}

export interface ActiveCounts {
  readonly medications: number;
  readonly services: number;
}

export function activeCounts(items: ReadonlyArray<Prescription>): ActiveCounts {
  const active = items.filter((item) => statusBucket(item.status) === 'active');
  return { medications: active.filter((item) => item.kind === 'medication').length, services: active.filter((item) => item.kind === 'service').length };
}
