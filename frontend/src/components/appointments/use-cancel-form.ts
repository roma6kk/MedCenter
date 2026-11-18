'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { cancelReasonSchema, type CancelReasonForm } from './cancel-reason-schema';
import { useCancelAppointment } from './use-appointments';

export interface CancelFormState {
  readonly register: UseFormRegister<CancelReasonForm>;
  readonly errors: FieldErrors<CancelReasonForm>;
  readonly submit: () => void;
  readonly pending: boolean;
  readonly notCancellable: boolean;
  readonly problem: ProblemDetails | null;
}

export function useCancelForm(appointmentId: string, onCancelled: () => void): CancelFormState {
  const form = useForm<CancelReasonForm>({ resolver: zodResolver(cancelReasonSchema), defaultValues: {} });
  const cancel = useCancelAppointment();
  const failure: ProblemDetails | null = isApiError(cancel.error) ? cancel.error.problem : null;
  const submit = form.handleSubmit(({ reason }) => {
    if (cancel.isPending) return;
    cancel.mutate(
      { appointmentId, reason },
      {
        onSuccess: onCancelled,
        onError: (error) => {
          if (isApiError(error) && error.errorCode === 'VALIDATION_ERROR') applyProblemToForm(error.problem, form.setError, ['reason']);
        },
      },
    );
  });
  return {
    register: form.register,
    errors: form.formState.errors,
    submit: () => void submit(),
    pending: cancel.isPending,
    notCancellable: failure?.errorCode === 'APPOINTMENT_NOT_CANCELLABLE',
    problem: failure !== null && failure.errorCode !== 'VALIDATION_ERROR' && failure.errorCode !== 'APPOINTMENT_NOT_CANCELLABLE' ? failure : null,
  };
}
