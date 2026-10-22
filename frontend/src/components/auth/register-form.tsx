'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import type { Translate } from '@/lib/i18n/translate';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { clinicDateKey } from '@/lib/clinic-time';
import { AUTH_INPUT_CLASS, AuthField } from './auth-field';
import { useRegisterForm, type RegisterFormState } from './use-register-form';

const LOGIN_HREF = '/api/auth/authorize?returnTo=%2Fbooking';

function RegisterSuccess(): ReactNode {
  const t = useT('auth.register');
  return (
    <div data-testid="register-success" role="status">
      <h1 className="text-[28px] font-bold leading-tight">{t('successTitle')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('successLead')}</p>
      <a href={LOGIN_HREF} className={`${buttonVariants({ size: 'lg' })} mt-6 w-full`}>{t('successCta')}</a>
    </div>
  );
}

function IdentityFields({ state }: { readonly state: RegisterFormState }): ReactNode {
  const t = useT('auth.register');
  const { register, formState: { errors } } = state.form;
  return (
    <>
      <AuthField id="email" label={t('email')} error={errors.email?.message}>
        {(control) => <input {...control} type="email" autoComplete="email" aria-required="true" {...register('email')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
      {state.isEmailTaken ? <Link href={LOGIN_HREF} className="mt-1.5 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline">{t('emailTakenLogin')}</Link> : null}
      <AuthField id="firstName" label={t('firstName')} error={errors.firstName?.message}>
        {(control) => <input {...control} autoComplete="given-name" aria-required="true" {...register('firstName')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
      <AuthField id="lastName" label={t('lastName')} error={errors.lastName?.message}>
        {(control) => <input {...control} autoComplete="family-name" aria-required="true" {...register('lastName')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
    </>
  );
}

function PersonalFields({ state }: { readonly state: RegisterFormState }): ReactNode {
  const t = useT('auth.register');
  const { register, formState: { errors } } = state.form;
  return (
    <>
      <AuthField id="birthDate" label={t('birthDate')} error={errors.birthDate?.message}>
        {(control) => <input {...control} type="date" max={clinicDateKey()} autoComplete="bday" aria-required="true" {...register('birthDate')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
      <AuthField id="gender" label={t('gender')} error={errors.gender?.message}>
        {(control) => (
          <select {...control} {...register('gender')} className={AUTH_INPUT_CLASS}>
            <option value="">{t('genderUnset')}</option>
            <option value="male">{t('genderMale')}</option>
            <option value="female">{t('genderFemale')}</option>
          </select>
        )}
      </AuthField>
      <AuthField id="password" label={t('password')} hint={t('passwordHint')} error={errors.password?.message}>
        {(control) => <input {...control} type="password" autoComplete="new-password" aria-required="true" {...register('password')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
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
      <h1 id="register-title" className="text-[28px] font-bold leading-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('lead')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('requiredNote')}</p>
      {state.problem !== null ? <div className="mt-4"><ProblemBanner problem={state.problem} /></div> : null}
      <div className="mt-4">
        <IdentityFields state={state} />
        <PersonalFields state={state} />
      </div>
      <Button type="submit" size="lg" aria-disabled={state.isPending || state.cooldown > 0 ? true : undefined} aria-busy={state.isPending} className="mt-6 w-full">
        {submitLabel(state, t)}
      </Button>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('haveAccount')} <Link href="/login" className="inline-flex min-h-[44px] items-center font-semibold text-primary underline">{t('signIn')}</Link>
      </p>
    </form>
  );
}
