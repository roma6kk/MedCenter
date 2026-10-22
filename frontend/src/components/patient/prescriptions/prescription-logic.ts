import type { Prescription } from '../patient-types';

/** What a request status means for the patient: a running course, a closed one, or one that is neither (paused, draft, unknown). */
export type StatusBucket = 'active' | 'closed' | 'other';
export type StatusFilter = 'active' | 'closed' | 'all';

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'revoked', 'stopped', 'entered-in-error']);

export function statusBucket(status: string): StatusBucket {
  if (status === 'active') return 'active';
  return CLOSED_STATUSES.has(status) ? 'closed' : 'other';
}

/** `all` keeps everything, including paused and draft items that neither of the other two tabs shows. */
export function filterByStatus(items: ReadonlyArray<Prescription>, filter: StatusFilter): ReadonlyArray<Prescription> {
  if (filter === 'all') return items;
  return items.filter((item) => statusBucket(item.status) === filter);
}

export interface PrescriptionGroup {
  /** The encounter the items were written at; `null` for the "other" group of items without one. */
  readonly encounterId: string | null;
  /** The earliest `authoredOn` of the group (RFC 3339), if any item has one: the visit date the heading shows. */
  readonly date: string | undefined;
  readonly items: ReadonlyArray<Prescription>;
}

function earliest(items: ReadonlyArray<Prescription>): string | undefined {
  const dates: string[] = items.flatMap((item) => (item.authoredOn === undefined ? [] : [item.authoredOn]));
  return dates.length === 0 ? undefined : dates.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
}

/** Groups by `encounterId` (newest visit first); items without an encounter form one last group. */
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

/** Counts of running prescriptions on the loaded page only: the list is paginated and the response has a page total, not a status total. */
export function activeCounts(items: ReadonlyArray<Prescription>): ActiveCounts {
  const active = items.filter((item) => statusBucket(item.status) === 'active');
  return { medications: active.filter((item) => item.kind === 'medication').length, services: active.filter((item) => item.kind === 'service').length };
}
