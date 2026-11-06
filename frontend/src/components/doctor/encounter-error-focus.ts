import type { FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

const SECTION_ORDER = ['observations', 'diagnoses', 'serviceRequests', 'medicationRequests', 'summary', 'recommendations'] as const;

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

export function firstErrorPath(errors: FieldErrors<CompleteEncounterForm>): string | null {
  for (const section of SECTION_ORDER) {
    const leaf: string | null = firstLeaf(errors[section], section);
    if (leaf === null) continue;
    return leaf === 'diagnoses' ? 'diagnoses.0.code' : leaf;
  }
  return null;
}

const ROW_FIELD_ORDER: Readonly<Record<string, ReadonlyArray<string>>> = {
  diagnoses: ['code', 'display', 'verificationStatus'],
  observations: ['code', 'value', 'unit'],
  serviceRequests: ['code', 'note'],
  medicationRequests: ['atcCode', 'dosageText', 'note'],
};

function screenRank(path: string): readonly [number, number, number] {
  const [section = '', row, field] = path.split('.');
  const sectionRank: number = SECTION_ORDER.findIndex((name) => name === section);
  const fieldRank: number = field === undefined ? -1 : (ROW_FIELD_ORDER[section] ?? []).indexOf(field);
  return [sectionRank < 0 ? SECTION_ORDER.length : sectionRank, row === undefined ? -1 : Number(row), fieldRank];
}

function compareRanks(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function firstPathOnScreen(paths: ReadonlyArray<string>): string | null {
  const [first] = [...paths].sort((a, b) => compareRanks(screenRank(a), screenRank(b)));
  if (first === undefined) return null;
  return first === 'diagnoses' ? 'diagnoses.0.code' : first;
}
