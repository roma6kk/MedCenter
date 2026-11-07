'use client';

import { useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { applyServerError, type ServerFieldRule } from './apply-server-error';

export interface FormBanner {
  readonly error: Error;
  readonly detail?: string;
}

interface FormBannerState {
  readonly banner: FormBanner | null;
  readonly fail: (error: Error) => void;
  readonly clear: () => void;
}

type FormErrorTarget<TValues extends FieldValues> = Pick<UseFormReturn<TValues>, 'setError' | 'setFocus'>;

// Decided once, when a submit fails: react-hook-form drops a server message from its field on the next keystroke, so a live-derived banner would re-announce the old failure.
export function useFormBanner<TValues extends FieldValues>(
  form: FormErrorTarget<TValues>,
  fields: ReadonlyArray<string>,
  rules: Readonly<Record<string, ServerFieldRule>> = {},
): FormBannerState {
  const [banner, setBanner] = useState<FormBanner | null>(null);
  const fail = (error: Error): void => {
    const outcome = applyServerError(error, form, fields, rules);
    setBanner(outcome.onFields ? null : { error, ...(outcome.leftover.length === 0 ? {} : { detail: outcome.leftover.join('. ') }) });
  };
  return { banner, fail, clear: () => setBanner(null) };
}
