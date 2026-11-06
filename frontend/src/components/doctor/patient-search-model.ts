import { canOpenPatientCard } from './journal-model';
import type { JournalAppointment } from './doctor-types';

export interface PatientHit {
  readonly patientId: string;
  readonly name: string;
  readonly lastVisit?: string;
  readonly nextVisit?: string;
}

export const MIN_QUERY_LENGTH = 2;
export const MAX_HITS = 6;

export function normalizeName(text: string): string {
  return text.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}

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

export function findPatients(patients: ReadonlyArray<PatientHit>, query: string): ReadonlyArray<PatientHit> {
  const words: ReadonlyArray<string> = normalizeName(query).split(' ').filter((word) => word !== '');
  if (normalizeName(query).length < MIN_QUERY_LENGTH) return [];
  return patients.filter((patient) => words.every((word) => normalizeName(patient.name).includes(word))).slice(0, MAX_HITS);
}
