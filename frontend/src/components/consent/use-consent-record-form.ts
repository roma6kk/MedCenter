'use client';

import { useMemo, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { clinicDateKey } from '@/lib/clinic-time';
import { consentRecordSchema, toConsentEntry, type ConsentRecordValues } from './consent-record-schema';
import { useRecordConsent } from './use-consent';

export type ConsentRecordForm = UseFormReturn<ConsentRecordValues>;

export interface ConsentRecordFormState {
  readonly form: ConsentRecordForm;
  readonly submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  readonly isPending: boolean;
  /** 409 `CONSENT_ALREADY_ACTIVE`: the patient has a consent in force, the revocation comes first. */
  readonly isAlreadyActive: boolean;
  /** A failure no field explains; a banner shows it. */
  readonly problem: ProblemDetails | null;
}

const DEFAULTS: ConsentRecordValues = {
  formNumber: '',
  signedAt: '',
  status: 'active',
  consenterType: 'self',
  relatedPersonId: '',
  representativeDocument: '',
  signedByName: '',
  file: null,
};

/** Fields the server may name; the scan travels under `file` (3.10) and `scanId` (3.8), both shown on the file input. */
const FIELDS: ReadonlyArray<string> = ['formNumber', 'signedAt', 'status', 'consenterType', 'relatedPersonId', 'representativeDocument', 'signedByName', 'file', 'scanId'];

/** The clerk's form that records a paper consent or refusal (API 3.10 then 3.8): client rules, one send at a time, server answers on the fields. */
export function useConsentRecordForm(patientId: string, role: 'ADMIN' | 'DOCTOR'): ConsentRecordFormState {
  const schema = useMemo(() => consentRecordSchema(role, clinicDateKey()), [role]);
  const form = useForm<ConsentRecordValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const record = useRecordConsent(patientId);
  const [isAlreadyActive, setIsAlreadyActive] = useState(false);
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const setFieldError: ConsentRecordForm['setError'] = (name, error) => form.setError(name === ('scanId' as string) ? 'file' : name, error);

  const showFailure = (error: unknown): void => {
    if (!isApiError(error)) return;
    if (error.errorCode === 'CONSENT_ALREADY_ACTIVE') {
      setIsAlreadyActive(true);
      return;
    }
    const unmatched: ReadonlyArray<string> = error.errorCode === 'VALIDATION_ERROR' ? applyProblemToForm(error.problem, setFieldError, FIELDS) : ['not a field error'];
    const hasFieldErrors: boolean = (error.problem.details?.length ?? 0) > unmatched.length;
    if (!hasFieldErrors || unmatched.length > 0) setProblem(error.problem);
  };

  const submit = form.handleSubmit((values) => {
    if (record.isPending) return;
    setIsAlreadyActive(false);
    setProblem(null);
    record.mutate(toConsentEntry(values), { onSuccess: () => form.reset(DEFAULTS), onError: showFailure });
  });
  return { form, submit, isPending: record.isPending, isAlreadyActive, problem };
}
