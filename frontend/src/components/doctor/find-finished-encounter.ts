import { fetchPatientHistory } from './doctor-api';

const HISTORY_SCAN_PAGE_SIZE = 100;
/** A patient with more than this many finished visits is not a realistic case for a lookup by appointment. */
const HISTORY_SCAN_MAX_PAGES = 5;

/**
 * Finds the finished encounter of an appointment through the patient's history (API 7.4: each item carries its
 * `appointmentId`). The encounter service refuses to open an appointment that already has a finished encounter, and
 * the appointment itself stays `booked`; this lookup lets the doctor still reach the completed record read-only.
 *
 * Resolves `null` when there is none (or the history cannot be read): the caller then reports the original conflict.
 */
export async function findFinishedEncounterId(patientId: string, appointmentId: string): Promise<string | null> {
  for (let page = 1; page <= HISTORY_SCAN_MAX_PAGES; page += 1) {
    const result = await fetchPatientHistory(patientId, { page, pageSize: HISTORY_SCAN_PAGE_SIZE });
    const match = result.items.find((item) => item.appointmentId === appointmentId);
    if (match !== undefined) return match.id;
    if (page >= result.meta.totalPages) return null;
  }
  return null;
}
