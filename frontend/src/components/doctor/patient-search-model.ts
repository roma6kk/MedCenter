/**
 * patient-search-model — the doctor's patient search is a search over the patients the doctor's own journal knows: there is no
 * «find a patient» endpoint (patient-service only reads a card by id, and only through a care relation). Pure shaping, so
 * every rule below is testable on plain rows.
 */
import { canOpenPatientCard } from './journal-model';
import type { JournalAppointment } from './doctor-types';

export interface PatientHit {
  readonly patientId: string;
  readonly name: string;
  /** Start (RFC 3339) of the patient's latest visit that has begun; absent when the patient only has visits ahead. */
  readonly lastVisit?: string;
  /** Start (RFC 3339) of the patient's earliest booked visit still ahead. */
  readonly nextVisit?: string;
}

/** The search needs this many characters before it looks: one letter matches half of the clinic. */
export const MIN_QUERY_LENGTH = 2;
export const MAX_HITS = 6;

/** Lower case, `ё` as `е`, single spaces: how a name and a query are compared. */
export function normalizeName(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

/**
 * The distinct patients of the journal rows: those with a past visit first (the newest first), then those who only have a
 * visit ahead (the nearest first). A patient whose every row is cancelled or a no-show has no care relation, so their card
 * would answer 403: they are not offered. A row without the name cannot be searched. A visit that has not begun yet
 * (`nowMs`) is the patient's next visit, never the last one.
 */
export function patientsOf(visits: ReadonlyArray<JournalAppointment>, nowMs: number = Date.now()): ReadonlyArray<PatientHit> {
  const byPatient = new Map<string, { name: string; last?: string; next?: string }>();
  for (const visit of visits) {
    if (visit.patientName === undefined || !canOpenPatientCard(visit.status)) continue;
    const entry = byPatient.get(visit.patientId) ?? { name: visit.patientName };
    const start: number = Date.parse(visit.start);
    if (start <= nowMs) {
      if (entry.last === undefined || start > Date.parse(entry.last)) entry.last = visit.start;
    } else if (visit.status === 'booked' && (entry.next === undefined || start < Date.parse(entry.next))) {
      entry.next = visit.start;
    }
    byPatient.set(visit.patientId, entry);
  }
  const hits: PatientHit[] = [...byPatient.entries()].map(([patientId, entry]) => ({
    patientId,
    name: entry.name,
    ...(entry.last === undefined ? {} : { lastVisit: entry.last }),
    ...(entry.next === undefined ? {} : { nextVisit: entry.next }),
  }));
  return hits.sort((a, b) => {
    if (a.lastVisit !== undefined && b.lastVisit !== undefined) return Date.parse(b.lastVisit) - Date.parse(a.lastVisit);
    if (a.lastVisit !== undefined) return -1;
    if (b.lastVisit !== undefined) return 1;
    return Date.parse(a.nextVisit ?? '') - Date.parse(b.nextVisit ?? '');
  });
}

/** Patients whose name contains every word of the query (in any order), at most `MAX_HITS`; nothing for a query that is too short. */
export function findPatients(patients: ReadonlyArray<PatientHit>, query: string): ReadonlyArray<PatientHit> {
  const words: ReadonlyArray<string> = normalizeName(query).split(' ').filter((word) => word !== '');
  if (normalizeName(query).length < MIN_QUERY_LENGTH) return [];
  return patients.filter((patient) => words.every((word) => normalizeName(patient.name).includes(word))).slice(0, MAX_HITS);
}
