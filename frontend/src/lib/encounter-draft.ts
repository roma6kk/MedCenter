// Local only (no draft endpoint): the form fields without patient identity, keyed by encounter id; storage is best-effort.
import type { CompleteEncounterForm } from '@/lib/contracts';

const KEY_PREFIX = 'medcenter.encounterDraft.';
export const DRAFT_MAX_AGE_MS: number = 3 * 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 10;
const MAX_BYTES = 200_000;

const VERIFICATION: ReadonlyArray<string> = ['working', 'provisional', 'confirmed'];

export interface EncounterDraft {
  readonly values: CompleteEncounterForm;
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
  | { readonly kind: 'blank' }
  | { readonly kind: 'failed' };

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
  }
}

// A sign-out must not leave clinical text for whoever uses the workstation next.
export function clearAllDrafts(): void {
  try {
    storedEntries(window.localStorage).forEach((entry) => window.localStorage.removeItem(entry.key));
  } catch {
  }
}
