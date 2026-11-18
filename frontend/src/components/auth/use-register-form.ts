'use client';

import { useState, type BaseSyntheticEvent } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm, hasDetailCode } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import { REGISTER_FIELDS, registerFormSchema, toRegisterRequest, type RegisterFormValues, type RegisterRequest } from './register-schema';

type RegisterForm = UseFormReturn<RegisterFormValues>;

export interface RegisterFormState {
  readonly form: RegisterForm;
  readonly submit: (event?: BaseSyntheticEvent) => Promise<void>;
  readonly problem: ProblemDetails | null;
  readonly isEmailTaken: boolean;
  readonly isPending: boolean;
  readonly cooldown: number;
  readonly isSuccess: boolean;
}

interface RegisterProblems {
  readonly problem: ProblemDetails | null;
  readonly isEmailTaken: boolean;
  readonly show: (failure: ProblemDetails) => void;
  readonly clear: () => void;
}

function useRegisterProblems(form: RegisterForm): RegisterProblems {
  const t = useT('auth.register');
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const setFieldError: RegisterForm['setError'] = (name, error) =>
    form.setError(String(name).startsWith('accountConsent') ? 'accountConsent' : name, error);
  const show = (failure: ProblemDetails): void => {
    if (hasDetailCode(failure, 'EMAIL_TAKEN')) {
      setIsEmailTaken(true);
      form.setError('email', { type: 'server', message: t('emailTaken') });
      form.setFocus('email');
      return;
    }
    if (failure.errorCode === 'AGE_RESTRICTED') {
      form.setError('birthDate', { type: 'server', message: 'validation.ageRestricted' });
      form.setFocus('birthDate');
      return;
    }
    const unmatched: ReadonlyArray<string> = applyProblemToForm(failure, setFieldError, REGISTER_FIELDS);
    const hasFieldErrors: boolean = (failure.details?.length ?? 0) > unmatched.length;
    if (!hasFieldErrors || unmatched.length > 0) setProblem(failure);
  };
  const clear = (): void => {
    setProblem(null);
    setIsEmailTaken(false);
  };
  return { problem, isEmailTaken, show, clear };
}

export function useRegisterForm(): RegisterFormState {
  const form: RegisterForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', firstName: '', lastName: '', password: '', birthDate: '', gender: '', phone: '', accountConsent: false },
  });
  const problems: RegisterProblems = useRegisterProblems(form);
  const cooldown: number = useRetryCooldown(problems.problem);
  const registration = useMutation({
    mutationFn: (values: RegisterRequest) => apiFetch('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(values) }),
    onMutate: problems.clear,
    onError: (error: unknown) => {
      if (isApiError(error)) problems.show(error.problem);
    },
  });
  const send = form.handleSubmit((values) => registration.mutate(toRegisterRequest(values)));
  // The button is `aria-disabled` (keeps focus), so a press, Enter or repeated submit must be refused here.
  const closed: boolean = registration.isPending || cooldown > 0;
  return {
    form,
    submit: (event) => (closed ? Promise.resolve(event?.preventDefault()) : send(event)),
    problem: problems.problem,
    isEmailTaken: problems.isEmailTaken,
    isPending: registration.isPending,
    cooldown,
    isSuccess: registration.isSuccess,
  };
}
