import type { KeyboardEvent } from 'react';
import { FIELD_CLASS } from '@/components/ui/field-styles';
import { get, type FieldErrors } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';

export const INPUT_CLASS = `mt-1 ${FIELD_CLASS}`;
export const SELECT_BOX_CLASS = 'mt-1';
export const ROW_CLASS = 'mt-4 border-t border-border-soft pt-4 first:mt-0 first:border-t-0 first:pt-0';

export function errorAt(errors: FieldErrors<CompleteEncounterForm>, path: string): string | undefined {
  const node: unknown = get(errors, path);
  if (typeof node === 'object' && node !== null && 'message' in node) {
    const message: unknown = (node as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return undefined;
}

export function a11yOf(id: string, error: string | undefined): { readonly 'aria-invalid': boolean; readonly 'aria-describedby': string | undefined } {
  return { 'aria-invalid': error !== undefined, 'aria-describedby': error !== undefined ? `${id}-error` : undefined };
}

// Completion is atomic: only the Complete button may submit; Enter in a single-line field must not.
export function blockImplicitSubmit(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) event.preventDefault();
}
