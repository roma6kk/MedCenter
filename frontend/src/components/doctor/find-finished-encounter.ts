import { fetchPatientHistory } from './doctor-api';

const HISTORY_SCAN_PAGE_SIZE = 100;
const HISTORY_SCAN_MAX_PAGES = 5;

export async function findFinishedEncounterId(patientId: string, appointmentId: string): Promise<string | null> {
  for (let page = 1; page <= HISTORY_SCAN_MAX_PAGES; page += 1) {
    const result = await fetchPatientHistory(patientId, { page, pageSize: HISTORY_SCAN_PAGE_SIZE });
    const match = result.items.find((item) => item.appointmentId === appointmentId);
    if (match !== undefined) return match.id;
    if (page >= result.meta.totalPages) return null;
  }
  return null;
}
