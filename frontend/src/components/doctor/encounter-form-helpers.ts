/**
 * encounter-form-helpers — styles and small pure helpers shared by the sections of the completion form.
 * Kept out of the component file (`encounter-form-fields.tsx`): a file that exports both components and values breaks Fast Refresh.
 */
import type { KeyboardEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-variants';
import { get, type FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

export const INPUT_CLASS = 'mt-1 min-h-[44px] w-full rounded-control border border-input bg-card p-2';
export const ADD_BUTTON_CLASS = `mt-3 ${buttonVariants({ variant: 'secondary' })}`;
export const FIELDSET_CLASS = 'rounded-card border border-border p-4';
export const ROW_CLASS = 'mt-3 rounded-control border border-border p-3';

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
