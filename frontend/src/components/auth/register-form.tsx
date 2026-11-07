'use client';

import type { ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import type { Translate } from '@/lib/i18n/translate';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { AUTHORIZE_PATH } from '@/lib/auth/authorize-href';
import { useT } from '@/lib/i18n/use-t';
import { clinicDateKey } from '@/lib/clinic-time';
import { AUTH_INPUT_CLASS, AuthField } from './auth-field';
import { useRegisterForm, type RegisterFormState } from './use-register-form';

// Sign-in is a plain `<a>`: the target redirects to another origin, which `next/link` must not prefetch.
function SignInLink({ className, children }: { readonly className: string; readonly children: ReactNode }): ReactNode {
  return <a href={AUTHORIZE_PATH} className={className}>{children}</a>;
}

function RegisterSuccess(): ReactNode {
  const t = useT('auth.register');
  return (
    <div data-testid="register-success" role="status">
      <h1 className="text-2xl font-bold leading-tight">{t('successTitle')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('successLead')}</p>
      <SignInLink className={`${buttonVariants({ size: 'lg' })} mt-6 w-full`}>{t('successCta')}</SignInLink>
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
      {state.isEmailTaken ? <SignInLink className="mt-1.5 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline">{t('emailTakenLogin')}</SignInLink> : null}
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
  const { register, control: formControl, formState: { errors } } = state.form;
  return (
    <>
      <AuthField id="birthDate" label={t('birthDate')} error={errors.birthDate?.message}>
        {(control) => (
          <Controller control={formControl} name="birthDate" render={({ field }) => <DatePicker {...control} {...field} max={clinicDateKey()} autoComplete="bday" aria-required="true" />} />
        )}
      </AuthField>
      <AuthField id="gender" label={t('gender')} error={errors.gender?.message}>
        {(control) => (
          <Select {...control} {...register('gender')}>
            <option value="">{t('genderUnset')}</option>
            <option value="male">{t('genderMale')}</option>
            <option value="female">{t('genderFemale')}</option>
          </Select>
        )}
      </AuthField>
      <AuthField id="phone" label={t('phone')} hint={t('phoneHint')} error={errors.phone?.message}>
        {(control) => <input {...control} type="tel" autoComplete="tel" inputMode="tel" {...register('phone')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
      <AuthField id="password" label={t('password')} hint={t('passwordHint')} error={errors.password?.message}>
        {(control) => <input {...control} type="password" autoComplete="new-password" aria-required="true" {...register('password')} className={AUTH_INPUT_CLASS} />}
      </AuthField>
    </>
  );
}

function ConsentField({ state }: { readonly state: RegisterFormState }): ReactNode {
  const t = useT('auth.register');
  const { register, formState: { errors } } = state.form;
  return (
    <AuthField id="accountConsent" label={t('consentLabel')} error={errors.accountConsent?.message} hint={t('consentRecordNote')} labelHidden>
      {(control) => (
        <Checkbox {...control} aria-required="true" {...register('accountConsent')} wrapperClassName="items-start">
          {t('consentLabel')}
        </Checkbox>
      )}
    </AuthField>
  );
}

function submitLabel(state: RegisterFormState, t: Translate): string {
  if (state.isPending) return t('submitting');
  return state.cooldown > 0 ? t('retryIn', { seconds: state.cooldown }) : t('submit');
}

export function RegisterForm(): ReactNode {
  const t = useT('auth.register');
  useDocumentTitle(t('title'));
  const state: RegisterFormState = useRegisterForm();
  if (state.isSuccess) return <RegisterSuccess />;
  return (
    <form onSubmit={state.submit} noValidate aria-labelledby="register-title">
      <h1 id="register-title" className="text-2xl font-bold leading-tight">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('lead')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('requiredNote')}</p>
      {state.problem !== null ? <div className="mt-4"><ProblemBanner problem={state.problem} /></div> : null}
      <div className="mt-4">
        <IdentityFields state={state} />
        <PersonalFields state={state} />
        <ConsentField state={state} />
      </div>
      <Button type="submit" size="lg" aria-disabled={state.isPending || state.cooldown > 0 ? true : undefined} aria-busy={state.isPending} className="mt-6 w-full">
        {submitLabel(state, t)}
      </Button>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('haveAccount')} <SignInLink className="inline-flex min-h-[44px] items-center font-semibold text-primary underline">{t('signIn')}</SignInLink>
      </p>
    </form>
  );
}
