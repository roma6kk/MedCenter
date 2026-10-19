import type { FieldErrors, FieldValues } from 'react-hook-form';

/** `error.message` of a field, already resolved to text. */
export type FieldMessages<TField extends string> = Readonly<Partial<Record<TField, string>>>;

/**
 * Flattens react-hook-form's error tree to `{ field: text }` (top-level fields only), resolving message keys to text.
 * Fields with an array or nested error (`windows`) are read through their own `message` when they have one.
 */
export function messagesOf<TField extends string, TValues extends FieldValues>(
  errors: FieldErrors<TValues>,
  resolve: (message: string | undefined) => string | undefined,
): FieldMessages<TField> {
  const entries = Object.entries(errors).map(([field, error]) => [field, resolve((error as { message?: string } | undefined)?.message)]);
  return Object.fromEntries(entries.filter(([, message]) => message !== undefined)) as FieldMessages<TField>;
}
