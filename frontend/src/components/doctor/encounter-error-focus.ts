import type { FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

/** The sections of the form in the order they appear on screen (the schema order differs: recommendations come last on screen). */
const SECTION_ORDER = ['summary', 'diagnoses', 'observations', 'serviceRequests', 'medicationRequests', 'recommendations'] as const;

/** The first leaf of a react-hook-form error tree: the node that carries a `message`. */
function firstLeaf(node: unknown, path: string): string | null {
  if (typeof node !== 'object' || node === null) return null;
  if ('message' in node && typeof (node as { message?: unknown }).message === 'string') return path;
  for (const [key, child] of Object.entries(node)) {
    if (key === 'ref') continue;
    const leaf: string | null = firstLeaf(child, `${path}.${key}`);
    if (leaf !== null) return leaf;
  }
  return null;
}

/**
 * The form path to focus after a failed submit: the first invalid field on screen. An error on the whole list
 * (`diagnoses`: at least one) points at the first row's code input, which is where the doctor has to act.
 */
export function firstErrorPath(errors: FieldErrors<CompleteEncounterForm>): string | null {
  for (const section of SECTION_ORDER) {
    const leaf: string | null = firstLeaf(errors[section], section);
    if (leaf === null) continue;
    return leaf === 'diagnoses' ? 'diagnoses.0.code' : leaf;
  }
  return null;
}

/** The fields of a list row in the order they appear on screen; a field that is not here is not shown (a `codeSystem`). */
const ROW_FIELD_ORDER: Readonly<Record<string, ReadonlyArray<string>>> = {
  diagnoses: ['code', 'display', 'verificationStatus'],
  observations: ['code', 'value', 'unit'],
  serviceRequests: ['code', 'note'],
  medicationRequests: ['atcCode', 'dosageText', 'note'],
};

/** `[section, row, field]` rank of a form path: smaller is higher on screen. A whole list (`diagnoses`) ranks as its first row. */
function screenRank(path: string): readonly [number, number, number] {
  const [section = '', row, field] = path.split('.');
  const sectionRank: number = SECTION_ORDER.findIndex((name) => name === section);
  const fieldRank: number = field === undefined ? -1 : (ROW_FIELD_ORDER[section] ?? []).indexOf(field);
  return [sectionRank < 0 ? SECTION_ORDER.length : sectionRank, row === undefined ? -1 : Number(row), fieldRank];
}

function compareRanks(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Of the form paths a server answer names, the one highest on screen (where focus goes after a `VALIDATION_ERROR`).
 * A path naming a whole list points at the first row's code field, as `firstErrorPath` does.
 */
export function firstPathOnScreen(paths: ReadonlyArray<string>): string | null {
  const [first] = [...paths].sort((a, b) => compareRanks(screenRank(a), screenRank(b)));
  if (first === undefined) return null;
  return first === 'diagnoses' ? 'diagnoses.0.code' : first;
}
