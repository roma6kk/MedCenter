/**
 * started-encounters — which appointments this browser has already opened an encounter for.
 *
 * The appointment stays `booked` while its encounter is in progress and no endpoint tells a doctor "this appointment has an
 * open encounter", so the journal cannot say «Продолжить приём» from the server's data (open question for the owner). Until it
 * can, the browser remembers the pairs it created itself. Only two opaque ids are stored, no patient data; the key is
 * best-effort: storage can be blocked or empty, and then the button simply reads «Открыть приём» (opening is idempotent).
 */
const STORAGE_KEY = 'medcenter.startedEncounters';
/** A doctor's open visits are a handful; the cap only keeps a stale list from growing for ever. */
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

/** The encounter this browser opened for the appointment, if it remembers one. */
export function startedEncounterOf(appointmentId: string): string | null {
  const encounterId: unknown = read()[appointmentId];
  return typeof encounterId === 'string' && encounterId !== '' ? encounterId : null;
}

export function rememberStartedEncounter(appointmentId: string, encounterId: string): void {
  try {
    // Re-inserting moves the key to the end, so the oldest entries are the ones the cap drops.
    const { [appointmentId]: _replaced, ...rest } = read();
    const kept: Array<[string, string]> = Object.entries(rest).slice(-(MAX_ENTRIES - 1));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries([...kept, [appointmentId, encounterId]])));
  } catch {
    // Storage is blocked or full: the button falls back to «Открыть приём».
  }
}
