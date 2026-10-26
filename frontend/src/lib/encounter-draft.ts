/**
 * encounter-draft — the unfinished completion form of an encounter, kept in this browser (TASK-005 A8).
 *
 * The encounter service has one write for the clinical content, the atomic `POST /encounters/{id}/complete`; there is no
 * draft endpoint, so the draft is local only. It holds exactly the fields of the form (no patient identifier, no name), is
 * keyed by the encounter id, expires after a few days, is dropped when the visit is completed and when the user signs out.
 * Storage is best-effort: it can be blocked, full or absent (a private window), and every call below survives that.
 */
import type { CompleteEncounterForm } from '@/lib/contracts';

const KEY_PREFIX = 'medcenter.encounterDraft.';
/** A draft that has not been touched for this long is a forgotten one and goes on the next read. */
export const DRAFT_MAX_AGE_MS: number = 3 * 24 * 60 * 60 * 1000;
/** A doctor has a handful of open visits; the cap only keeps abandoned drafts from piling up. */
const MAX_DRAFTS = 10;
/** The form's own limits add up to well under this; a larger payload is not a form of ours. */
const MAX_BYTES = 200_000;

const VERIFICATION: ReadonlyArray<string> = ['working', 'provisional', 'confirmed'];

export interface EncounterDraft {
  readonly values: CompleteEncounterForm;
  /** ISO time of the last write. */
  readonly savedAt: string;
}

type Row = Readonly<Record<string, unknown>>;

function keyOf(encounterId: string): string {
  return `${KEY_PREFIX}${encounterId}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function rowsOf(value: unknown): ReadonlyArray<Row> {
  return Array.isArray(value) ? value.filter((item): item is Row => typeof item === 'object' && item !== null) : [];
}

/**
 * What is read back is only trusted as far as its shape: anything else becomes an empty field. A number that went through
 * JSON as `null` (an observation value that was never typed is `NaN`) comes back as `NaN`.
 */
function sanitize(raw: unknown): CompleteEncounterForm | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Row;
  const diagnoses = rowsOf(source['diagnoses']).map((row) => {
    const status: string = text(row['verificationStatus']);
    return {
      code: text(row['code']),
      display: text(row['display']),
      ...(VERIFICATION.includes(status) ? { verificationStatus: status as 'working' | 'provisional' | 'confirmed' } : {}),
    };
  });
  return {
    summary: text(source['summary']),
    diagnoses: diagnoses.length > 0 ? diagnoses : [{ code: '', display: '' }],
    recommendations: text(source['recommendations']),
    observations: rowsOf(source['observations']).map((row) => ({
      codeSystem: text(row['codeSystem']),
      code: text(row['code']),
      value: typeof row['value'] === 'number' ? row['value'] : Number.NaN,
      unit: text(row['unit']),
    })),
    serviceRequests: rowsOf(source['serviceRequests']).map((row) => ({ codeSystem: text(row['codeSystem']), code: text(row['code']), note: optionalText(row['note']) })),
    medicationRequests: rowsOf(source['medicationRequests']).map((row) => ({ atcCode: text(row['atcCode']), dosageText: text(row['dosageText']), note: optionalText(row['note']) })),
  };
}

/** True when nothing has been typed or chosen yet: an untouched form is not worth a draft (and leaves nothing in storage). */
export function isBlankForm(values: CompleteEncounterForm): boolean {
  return (
    values.summary.trim() === '' &&
    values.recommendations.trim() === '' &&
    values.diagnoses.every((row) => row.code === '' && row.display === '') &&
    values.observations.length === 0 &&
    values.serviceRequests.length === 0 &&
    values.medicationRequests.length === 0
  );
}

interface StoredEntry {
  readonly key: string;
  readonly savedAt: number;
}

function storedEntries(storage: Storage): ReadonlyArray<StoredEntry> {
  const entries: StoredEntry[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key: string | null = storage.key(index);
    if (key === null || !key.startsWith(KEY_PREFIX)) continue;
    let savedAt = 0;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      savedAt = typeof parsed === 'object' && parsed !== null ? Date.parse(text((parsed as Row)['savedAt'])) : 0;
    } catch {
      savedAt = 0;
    }
    entries.push({ key, savedAt: Number.isNaN(savedAt) ? 0 : savedAt });
  }
  return entries;
}

/** Expired and surplus drafts go; the newest ones stay. */
function prune(storage: Storage, now: number, keep: string): void {
  const alive: StoredEntry[] = [];
  for (const entry of storedEntries(storage)) {
    if (entry.key !== keep && now - entry.savedAt > DRAFT_MAX_AGE_MS) storage.removeItem(entry.key);
    else alive.push(entry);
  }
  alive
    .filter((entry) => entry.key !== keep)
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(MAX_DRAFTS - 1)
    .forEach((entry) => storage.removeItem(entry.key));
}

export function readDraft(encounterId: string, now: number = Date.now()): EncounterDraft | null {
  try {
    const raw: string | null = window.localStorage.getItem(keyOf(encounterId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const savedAt: string = text((parsed as Row)['savedAt']);
    const age: number = now - Date.parse(savedAt);
    const values: CompleteEncounterForm | null = sanitize((parsed as Row)['values']);
    if (values === null || Number.isNaN(age) || age > DRAFT_MAX_AGE_MS || isBlankForm(values)) {
      window.localStorage.removeItem(keyOf(encounterId));
      return null;
    }
    return { values, savedAt };
  } catch {
    return null;
  }
}

export type WriteResult =
  | { readonly kind: 'saved'; readonly savedAt: string }
  /** The form is untouched: nothing is kept and nothing is lost. */
  | { readonly kind: 'blank' }
  /** Storage is blocked or full: what the doctor typed is only on the screen. */
  | { readonly kind: 'failed' };

/** Writes the draft. A blank form removes it instead. */
export function writeDraft(encounterId: string, values: CompleteEncounterForm, now: Date = new Date()): WriteResult {
  try {
    if (isBlankForm(values)) {
      window.localStorage.removeItem(keyOf(encounterId));
      return { kind: 'blank' };
    }
    const savedAt: string = now.toISOString();
    const payload: string = JSON.stringify({ v: 1, savedAt, values: sanitize(values) });
    if (payload.length > MAX_BYTES) return { kind: 'failed' };
    window.localStorage.setItem(keyOf(encounterId), payload);
    prune(window.localStorage, now.getTime(), keyOf(encounterId));
    return { kind: 'saved', savedAt };
  } catch {
    return { kind: 'failed' };
  }
}

export function clearDraft(encounterId: string): void {
  try {
    window.localStorage.removeItem(keyOf(encounterId));
  } catch {
    // Nothing to forget when storage is unavailable.
  }
}

/** Every draft of this browser: a sign-out must not leave clinical text for whoever uses the workstation next. */
export function clearAllDrafts(): void {
  try {
    storedEntries(window.localStorage).forEach((entry) => window.localStorage.removeItem(entry.key));
  } catch {
    // See `clearDraft`.
  }
}
