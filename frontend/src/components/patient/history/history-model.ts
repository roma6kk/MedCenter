import { clinicDayOf } from '@/lib/clinic-time';
import type { HistoryEntry, Prescription } from '../patient-types';

interface MonthGroup {
  readonly key: string;
  readonly entries: ReadonlyArray<HistoryEntry>;
}

export interface HistorySummary {
  readonly completedVisits: number;
  readonly lastVisit?: string;
  readonly practitioners: number;
  readonly topDiagnosis?: DiagnosisCount;
}

export interface DiagnosisCount {
  readonly code: string;
  readonly display: string;
  readonly count: number;
  readonly share: number;
}

const NOT_COMPLETED: ReadonlySet<string> = new Set(['cancelled', 'entered-in-error']);

export function primaryCode(entry: HistoryEntry): string {
  return entry.diagnosis !== '' ? entry.diagnosis : (entry.diagnoses[0]?.code ?? '');
}

function primaryDisplay(entry: HistoryEntry): string {
  const code = primaryCode(entry);
  return entry.diagnoses.find((diagnosis) => diagnosis.code === code)?.display ?? '';
}

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

export function filterByDiagnosis(entries: ReadonlyArray<HistoryEntry>, code: string | null): ReadonlyArray<HistoryEntry> {
  return code === null ? entries : entries.filter((entry) => primaryCode(entry) === code);
}

export function prescriptionsByEncounter(prescriptions: ReadonlyArray<Prescription>): ReadonlyMap<string, ReadonlyArray<Prescription>> {
  const byEncounter = new Map<string, Prescription[]>();
  for (const prescription of prescriptions) {
    if (prescription.encounterId === undefined || prescription.encounterId === '') continue;
    byEncounter.set(prescription.encounterId, [...(byEncounter.get(prescription.encounterId) ?? []), prescription]);
  }
  return byEncounter;
}
