'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerPatientSchema, type RegisterPatientForm } from '@/lib/contracts';
import { apiFetch } from '@/lib/api/api-fetch';
import { useState } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { ApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';

export default function RegisterPage(): React.JSX.Element {
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterPatientForm>({ resolver: zodResolver(registerPatientSchema) });
  const onSubmit = async (values: RegisterPatientForm): Promise<void> => {
    setProblem(null);
    try {
      await apiFetch('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(values) });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) setProblem(error.problem);
    }
  };
  if (done) return <p data-testid="register-success">Регистрация выполнена. Войдите в систему.</p>;
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h1 className="serif text-2xl font-bold">Регистрация пациента</h1>
      {problem ? <div className="mt-3"><ProblemBanner title={problem.title} detail={problem.detail} errorCode={problem.errorCode} requestId={problem.requestId} /></div> : null}
      <label className="form-label mt-4 block" htmlFor="email">Email</label>
      <input id="email" type="email" {...register('email')} aria-describedby={errors.email ? 'email-error' : undefined} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
      {errors.email ? <p id="email-error" role="alert" className="text-sm text-[var(--destructive)]">{errors.email.message}</p> : null}
      <label className="form-label mt-3 block" htmlFor="firstName">Имя</label>
      <input id="firstName" {...register('firstName')} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
      <label className="form-label mt-3 block" htmlFor="lastName">Фамилия</label>
      <input id="lastName" {...register('lastName')} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
      <label className="form-label mt-3 block" htmlFor="password">Пароль (мин. 10 символов)</label>
      <input id="password" type="password" {...register('password')} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
      <label className="form-label mt-3 block" htmlFor="birthDate">Дата рождения</label>
      <input id="birthDate" type="date" {...register('birthDate')} className="mt-1 w-full rounded-[6px] border border-[var(--input)] p-2" />
      <button type="submit" disabled={isSubmitting} className="mt-5 w-full rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Зарегистрироваться</button>
    </form>
  );
}
