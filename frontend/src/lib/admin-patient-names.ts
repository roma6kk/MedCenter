/**
 * admin-patient-names — the names of the patients the administrator has seen in the user list, kept in `sessionStorage` of the
 * tab (never in a URL, never in a title: the name is private). The consent page of a patient (ADR-018) reads the admin
 * API by id only, so without this the page could not say whose paperwork it holds. Storage may be blocked: every access is guarded.
 */
const STORAGE_KEY = 'medcenter.adminPatientNames';

function readAll(): Record<string, string> {
  try {
    const raw: string | null = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Remembers `{ patientId: name }` for the rows of the user list that are patients. */
export function rememberPatientNames(entries: ReadonlyArray<{ readonly patientId: string; readonly name: string }>): void {
  if (entries.length === 0) return;
  try {
    const all = readAll();
    for (const entry of entries) all[entry.patientId] = entry.name;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage is blocked or full: the consent page then shows its neutral line.
  }
}

export function recallPatientName(patientId: string): string | undefined {
  const name: unknown = readAll()[patientId];
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}
