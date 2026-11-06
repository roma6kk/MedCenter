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

export function rememberPatientNames(entries: ReadonlyArray<{ readonly patientId: string; readonly name: string }>): void {
  if (entries.length === 0) return;
  try {
    const all = readAll();
    for (const entry of entries) all[entry.patientId] = entry.name;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
  }
}

export function recallPatientName(patientId: string): string | undefined {
  const name: unknown = readAll()[patientId];
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
}
