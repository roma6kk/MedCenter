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
  /** Start (RFC 3339) of the patient's latest visit in the searched period. */
  readonly lastVisit: string;
}

/** The search needs this many characters before it looks: one letter matches half of the clinic. */
export const MIN_QUERY_LENGTH = 2;
export const MAX_HITS = 6;

/** Lower case, `ё` as `е`, single spaces: how a name and a query are compared. */
export function normalizeName(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

/**
 * The distinct patients of the journal rows, the newest visit first. A patient whose every row is cancelled or a no-show
 * has no care relation, so their card would answer 403: they are not offered. A row without the name cannot be searched.
 */
export function patientsOf(visits: ReadonlyArray<JournalAppointment>): ReadonlyArray<PatientHit> {
  const latest = new Map<string, PatientHit>();
  for (const visit of visits) {
    if (visit.patientName === undefined || !canOpenPatientCard(visit.status)) continue;
    const known: PatientHit | undefined = latest.get(visit.patientId);
    if (known === undefined || Date.parse(visit.start) > Date.parse(known.lastVisit)) {
      latest.set(visit.patientId, { patientId: visit.patientId, name: visit.patientName, lastVisit: visit.start });
    }
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.lastVisit) - Date.parse(a.lastVisit));
}

/** Patients whose name contains every word of the query (in any order), at most `MAX_HITS`; nothing for a query that is too short. */
export function findPatients(patients: ReadonlyArray<PatientHit>, query: string): ReadonlyArray<PatientHit> {
  const words: ReadonlyArray<string> = normalizeName(query).split(' ').filter((word) => word !== '');
  if (normalizeName(query).length < MIN_QUERY_LENGTH) return [];
  return patients.filter((patient) => words.every((word) => normalizeName(patient.name).includes(word))).slice(0, MAX_HITS);
}
