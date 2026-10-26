/**
 * encounter-form-helpers — styles and small pure helpers shared by the sections of the completion form.
 * Kept out of the component file (`encounter-form-fields.tsx`): a file that exports both components and values breaks Fast Refresh.
 */
import type { KeyboardEvent } from 'react';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { get, type FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

/** The one shared field look, spaced from the label above it. */
export const INPUT_CLASS = `mt-1 ${FIELD_CLASS}`;
/** Box of a `Select` in a completion-form row: the same gap to its label. */
export const SELECT_BOX_CLASS = 'mt-1';
/**
 * One row of a repeatable list inside a section card. Rows are told apart by a hairline between them, not by a box of their
 * own: a bordered row inside a bordered card is the double frame A9 removes.
 */
export const ROW_CLASS = 'mt-4 border-t border-border-soft pt-4 first:mt-0 first:border-t-0 first:pt-0';

/** The `message` of a react-hook-form / zod error node at `path` (`diagnoses.0.code`), if there is one. */
export function errorAt(errors: FieldErrors<CompleteEncounterForm>, path: string): string | undefined {
  const node: unknown = get(errors, path);
  if (typeof node === 'object' && node !== null && 'message' in node) {
    const message: unknown = (node as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return undefined;
}

/** `aria-invalid` and `aria-describedby` of an input whose error is rendered by `FieldRow` with the same `id`. */
export function a11yOf(id: string, error: string | undefined): { readonly 'aria-invalid': boolean; readonly 'aria-describedby': string | undefined } {
  return { 'aria-invalid': error !== undefined, 'aria-describedby': error !== undefined ? `${id}-error` : undefined };
}

/**
 * Completing an encounter is atomic and cannot be amended, so only the "Complete" button may submit. The browser's implicit
 * submission (Enter in a single-line field: a diagnosis name, a dosage, a note, an open code list with no active option)
 * is cancelled here; a textarea keeps Enter for a new line and a button keeps Enter for its own click.
 */
export function blockImplicitSubmit(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) event.preventDefault();
}
