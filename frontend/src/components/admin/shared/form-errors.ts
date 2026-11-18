import type { FieldErrors, FieldValues } from 'react-hook-form';

export type FieldMessages<TField extends string> = Readonly<Partial<Record<TField, string>>>;

export function messagesOf<TField extends string, TValues extends FieldValues>(
  errors: FieldErrors<TValues>,
  resolve: (message: string | undefined) => string | undefined,
): FieldMessages<TField> {
  const entries = Object.entries(errors).map(([field, error]) => [field, resolve((error as { message?: string } | undefined)?.message)]);
  return Object.fromEntries(entries.filter(([, message]) => message !== undefined)) as FieldMessages<TField>;
}
