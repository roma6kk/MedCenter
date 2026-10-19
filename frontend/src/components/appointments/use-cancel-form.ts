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
  /** BR-002: the server says the appointment can no longer be cancelled (409), the form has nothing left to offer. */
  readonly notCancellable: boolean;
  /** A failure that no field explains (not found, 5xx, offline); validation problems land on the field instead. */
  readonly problem: ProblemDetails | null;
}

/** The cancellation form of one appointment: client rule, server field errors and the 409 outcome. */
export function useCancelForm(appointmentId: string, onCancelled: () => void): CancelFormState {
  const form = useForm<CancelReasonForm>({ resolver: zodResolver(cancelReasonSchema), defaultValues: { reason: '' } });
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
