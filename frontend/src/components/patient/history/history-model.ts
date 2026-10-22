/**
 * history-model — pure numbers behind the patient history page.
 *
 * Everything is computed from the page of visits that is loaded, never from the whole record: the history is paginated, so
 * a caller that wants a total must take it from the response's `meta.totalItems`, not from these functions.
 */
import { clinicDayOf } from '@/lib/clinic-time';
import type { HistoryEntry, Prescription } from '../patient-types';

export interface MonthGroup {
  /** `YYYY-MM` of the clinic day. */
  readonly key: string;
  readonly entries: ReadonlyArray<HistoryEntry>;
}

export interface HistorySummary {
  /** Visits of the loaded page that were not cancelled. */
  readonly completedVisits: number;
  /** Newest visit start of the loaded page, RFC 3339. */
  readonly lastVisit?: string;
  /** Distinct `practitionerRoleId` of the loaded page. */
  readonly practitioners: number;
  readonly topDiagnosis?: DiagnosisCount;
}

export interface DiagnosisCount {
  readonly code: string;
  readonly display: string;
  readonly count: number;
  /** `count` relative to the most frequent diagnosis, 0..1: the length of its bar. */
  readonly share: number;
}

const NOT_COMPLETED: ReadonlySet<string> = new Set(['cancelled', 'entered-in-error']);

/** The primary ICD-10 code of a visit; an old record with a diagnosis list but no primary code falls back to the first of the list. */
export function primaryCode(entry: HistoryEntry): string {
  return entry.diagnosis !== '' ? entry.diagnosis : (entry.diagnoses[0]?.code ?? '');
}

function primaryDisplay(entry: HistoryEntry): string {
  const code = primaryCode(entry);
  return entry.diagnoses.find((diagnosis) => diagnosis.code === code)?.display ?? '';
}

/** Visits grouped by the clinic month they started in, in order of appearance (the API answers newest first). */
export function groupByMonth(entries: ReadonlyArray<HistoryEntry>): ReadonlyArray<MonthGroup> {
  const groups: Array<{ key: string; entries: HistoryEntry[] }> = [];
  for (const entry of entries) {
    const key = clinicDayOf(entry.date).slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}

/** How often each primary diagnosis occurs, most frequent first (ties: by code); visits without a diagnosis are left out. */
export function diagnosisFrequency(entries: ReadonlyArray<HistoryEntry>): ReadonlyArray<DiagnosisCount> {
  const counts = new Map<string, { count: number; display: string }>();
  for (const entry of entries) {
    const code = primaryCode(entry);
    if (code === '') continue;
    const known = counts.get(code);
    counts.set(code, { count: (known?.count ?? 0) + 1, display: known?.display || primaryDisplay(entry) });
  }
  const ranked = [...counts.entries()].sort(([codeA, a], [codeB, b]) => b.count - a.count || codeA.localeCompare(codeB));
  const max = ranked[0]?.[1].count ?? 1;
  return ranked.map(([code, { count, display }]) => ({ code, display, count, share: count / max }));
}

export function summarize(entries: ReadonlyArray<HistoryEntry>): HistorySummary {
  const completed = entries.filter((entry) => !NOT_COMPLETED.has(entry.status));
  const lastVisit = completed.map((entry) => entry.date).sort().at(-1);
  const topDiagnosis = diagnosisFrequency(completed)[0];
  return {
    completedVisits: completed.length,
    ...(lastVisit === undefined ? {} : { lastVisit }),
    practitioners: new Set(completed.map((entry) => entry.practitionerRoleId).filter((id) => id !== '')).size,
    ...(topDiagnosis === undefined ? {} : { topDiagnosis }),
  };
}

/** Visits whose primary diagnosis is `code`; `null` keeps everything. */
export function filterByDiagnosis(entries: ReadonlyArray<HistoryEntry>, code: string | null): ReadonlyArray<HistoryEntry> {
  return code === null ? entries : entries.filter((entry) => primaryCode(entry) === code);
}

/** The loaded prescriptions keyed by the encounter they were written at; a prescription without `encounterId` matches no visit. */
export function prescriptionsByEncounter(prescriptions: ReadonlyArray<Prescription>): ReadonlyMap<string, ReadonlyArray<Prescription>> {
  const byEncounter = new Map<string, Prescription[]>();
  for (const prescription of prescriptions) {
    if (prescription.encounterId === undefined || prescription.encounterId === '') continue;
    byEncounter.set(prescription.encounterId, [...(byEncounter.get(prescription.encounterId) ?? []), prescription]);
  }
  return byEncounter;
}
