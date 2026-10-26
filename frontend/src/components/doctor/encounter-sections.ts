/**
 * encounter-sections — the sections of the completion form in the order of the visit (A6): examination and vital signs,
 * diagnoses, ordered services, prescribed drugs, and the conclusion with recommendations last.
 * Kept free of components so the navigator, the form and the error-focus order share one list.
 */
import type { FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

export const SECTION_IDS = ['observations', 'diagnoses', 'services', 'medications', 'conclusion'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** `filled`: something is entered (a required section: everything it needs); `error`: the form or the server marked a field. */
export type SectionState = 'empty' | 'filled' | 'error';

/** Whether the visit can be completed without the section; the navigator says so for an empty one. */
export const REQUIRED_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>(['diagnoses', 'conclusion']);

export function sectionDomId(id: SectionId): string {
  return `encounter-section-${id}`;
}

/** Which keys of the form's error tree belong to which section. */
const ERROR_KEYS: Readonly<Record<SectionId, ReadonlyArray<keyof CompleteEncounterForm>>> = {
  observations: ['observations'],
  diagnoses: ['diagnoses'],
  services: ['serviceRequests'],
  medications: ['medicationRequests'],
  conclusion: ['summary', 'recommendations'],
};

const hasCode = (rows: ReadonlyArray<{ readonly code?: string } | undefined> | undefined): boolean => (rows ?? []).some((row) => (row?.code ?? '') !== '');

/** The state of every section from what is in the form and from the errors marked on it. */
export function sectionStates(values: Partial<CompleteEncounterForm>, errors: FieldErrors<CompleteEncounterForm>): Readonly<Record<SectionId, SectionState>> {
  const filled: Readonly<Record<SectionId, boolean>> = {
    observations: hasCode(values.observations),
    diagnoses: hasCode(values.diagnoses),
    services: hasCode(values.serviceRequests),
    medications: (values.medicationRequests ?? []).some((row) => (row?.atcCode ?? '') !== ''),
    conclusion: (values.summary ?? '').trim() !== '' && (values.recommendations ?? '').trim() !== '',
  };
  const result = {} as Record<SectionId, SectionState>;
  for (const id of SECTION_IDS) {
    const hasError: boolean = ERROR_KEYS[id].some((key) => errors[key] !== undefined);
    result[id] = hasError ? 'error' : filled[id] ? 'filled' : 'empty';
  }
  return result;
}
