'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import type { Translate } from '@/lib/i18n/translate';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { clinicDateKey } from '@/lib/clinic-time';
import { useRegisterForm, type RegisterFormState } from './use-register-form';

const LOGIN_HREF = '/api/auth/authorize?returnTo=%2Fbooking';
const BUTTON_CLASS = 'mt-5 min-h-[44px] w-full rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

function RegisterSuccess(): ReactNode {
  const t = useT('auth.register');
  return (
    <div data-testid="register-success" role="status">
      <h1 className="serif text-2xl font-bold">{t('successTitle')}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('successLead')}</p>
      <a href={LOGIN_HREF} className={`${BUTTON_CLASS} block text-center`}>{t('successCta')}</a>
    </div>
  );
}

function IdentityFields({ state }: { readonly state: RegisterFormState }): ReactNode {
  const t = useT('auth.register');
  const { register, formState: { errors } } = state.form;
  return (
    <>
      <FormField id="email" label={t('email')} error={errors.email?.message}>
        {(control) => <input {...control} type="email" autoComplete="email" aria-required="true" {...register('email')} className={INPUT_CLASS} />}
      </FormField>
      {state.isEmailTaken ? <Link href={LOGIN_HREF} className="mt-1 inline-block text-sm underline">{t('emailTakenLogin')}</Link> : null}
      <FormField id="firstName" label={t('firstName')} error={errors.firstName?.message}>
        {(control) => <input {...control} autoComplete="given-name" aria-required="true" {...register('firstName')} className={INPUT_CLASS} />}
      </FormField>
      <FormField id="lastName" label={t('lastName')} error={errors.lastName?.message}>
        {(control) => <input {...control} autoComplete="family-name" aria-required="true" {...register('lastName')} className={INPUT_CLASS} />}
      </FormField>
    </>
  );
}

function PersonalFields({ state }: { readonly state: RegisterFormState }): ReactNode {
  const t = useT('auth.register');
  const { register, formState: { errors } } = state.form;
  return (
    <>
      <FormField id="birthDate" label={t('birthDate')} error={errors.birthDate?.message}>
        {(control) => <input {...control} type="date" max={clinicDateKey()} autoComplete="bday" aria-required="true" {...register('birthDate')} className={INPUT_CLASS} />}
      </FormField>
      <FormField id="gender" label={t('gender')} error={errors.gender?.message}>
        {(control) => (
          <select {...control} {...register('gender')} className={INPUT_CLASS}>
            <option value="">{t('genderUnset')}</option>
            <option value="male">{t('genderMale')}</option>
            <option value="female">{t('genderFemale')}</option>
          </select>
        )}
      </FormField>
      <FormField id="password" label={t('password')} hint={t('passwordHint')} error={errors.password?.message}>
        {(control) => <input {...control} type="password" autoComplete="new-password" aria-required="true" {...register('password')} className={INPUT_CLASS} />}
      </FormField>
    </>
  );
}

function submitLabel(state: RegisterFormState, t: Translate): string {
  if (state.isPending) return t('submitting');
  return state.cooldown > 0 ? t('retryIn', { seconds: state.cooldown }) : t('submit');
}

/** Patient self-registration (`POST /api/v1/auth/register`, FR-001). Server field errors land on their fields. */
export function RegisterForm(): ReactNode {
  const t = useT('auth.register');
  useDocumentTitle(t('title'));
  const state: RegisterFormState = useRegisterForm();
  if (state.isSuccess) return <RegisterSuccess />;
  return (
    <form onSubmit={state.submit} noValidate aria-labelledby="register-title">
      <h1 id="register-title" className="serif text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('lead')}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t('requiredNote')}</p>
      {state.problem !== null ? <div className="mt-3"><ProblemBanner problem={state.problem} /></div> : null}
      <div className="mt-4">
        <IdentityFields state={state} />
        <PersonalFields state={state} />
      </div>
      <button type="submit" aria-disabled={state.isPending || state.cooldown > 0 ? true : undefined} aria-busy={state.isPending} className={BUTTON_CLASS}>
        {submitLabel(state, t)}
      </button>
      <p className="mt-4 text-sm">
        {t('haveAccount')} <Link href="/login" className="underline">{t('signIn')}</Link>
      </p>
    </form>
  );
}
