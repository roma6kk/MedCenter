const STORAGE_KEY = 'medcenter.startedEncounters';
const MAX_ENTRIES = 50;

type Entries = Readonly<Record<string, string>>;

function read(): Entries {
  try {
    const raw: string | null = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Entries) : {};
  } catch {
    return {};
  }
}

export function startedEncounterOf(appointmentId: string): string | null {
  const encounterId: unknown = read()[appointmentId];
  return typeof encounterId === 'string' && encounterId !== '' ? encounterId : null;
}

export function rememberStartedEncounter(appointmentId: string, encounterId: string): void {
  try {
    const { [appointmentId]: _replaced, ...rest } = read();
    const kept: Array<[string, string]> = Object.entries(rest).slice(-(MAX_ENTRIES - 1));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries([...kept, [appointmentId, encounterId]])));
  } catch {
    // Storage blocked or full: the button falls back to «Открыть приём».
  }
}
