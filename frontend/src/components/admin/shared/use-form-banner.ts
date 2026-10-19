'use client';

import { useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { applyServerError, type ServerFieldRule } from './apply-server-error';

/** The failure a form shows above its buttons. */
export interface FormBanner {
  readonly error: Error;
  /** Server messages the form has no field for (`details[]` of an unknown field); shown instead of the bare headline. */
  readonly detail?: string;
}

export interface FormBannerState {
  /** `null` while no failure needs the banner: nothing failed, a field took the message, or the failure was edited away. */
  readonly banner: FormBanner | null;
  /** `onError` of the submit's mutation: puts the failure on its field, or keeps it for the banner. */
  readonly fail: (error: Error) => void;
  /** A new submit starts: the old failure is not the answer any more. */
  readonly clear: () => void;
}

type FormErrorTarget<TValues extends FieldValues> = Pick<UseFormReturn<TValues>, 'setError' | 'setFocus'>;

/**
 * Decides once, when a submit fails, whether the failure belongs to a field or to the banner, and keeps that decision. The
 * decision must not follow the live form errors: react-hook-form drops a server message from its field on the next
 * keystroke, and a banner derived from «the mutation failed and no field shows it» would then announce the old failure
 * again (`role="alert"`) while the person types the fix.
 */
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
