'use client';

import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useClinicQuery, type ClinicDetails } from '@/components/catalog/use-clinic';
import { useT } from '@/lib/i18n/use-t';
import { FormProblem } from '../shared/admin-problem';
import { AdminPageHeader } from '../shared/admin-page-header';
import { CONTROL_CLASS, PANEL_CLASS } from '../shared/admin-styles';
import { messagesOf } from '../shared/form-errors';
import { controlProps, Field } from '../shared/form-field';
import { QueryState } from '../shared/query-state';
import { SubmitButton } from '../shared/submit-button';
import { useFormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { clinicSchema, type ClinicFormValues } from './clinic-schema';
import { useUpdateClinic } from './use-update-clinic';

const FIELDS: ReadonlyArray<keyof ClinicFormValues> = ['name', 'phone', 'email', 'address', 'hours'];

function ClinicForm({ clinic }: { readonly clinic: ClinicDetails }): ReactNode {
  const t = useT('admin.settings');
  const resolve = useFormMessage();
  const update = useUpdateClinic();
  const form = useForm<ClinicFormValues>({ resolver: zodResolver(clinicSchema), defaultValues: clinic });
  const { banner, fail, clear } = useFormBanner(form, FIELDS);
  const errors = messagesOf<keyof ClinicFormValues, ClinicFormValues>(form.formState.errors, resolve);
  const submit = form.handleSubmit((values) => {
    clear();
    update.mutate(values, { onError: fail });
  }, clear);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className={`${PANEL_CLASS} grid gap-3`}>
      <Field id="clinic-name" label={t('fields.name')} error={errors.name} required>
        <input {...controlProps('clinic-name', errors.name)} autoComplete="off" className={CONTROL_CLASS} {...form.register('name')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="clinic-phone" label={t('fields.phone')} error={errors.phone} hint={t('hints.phone')} required>
          <input {...controlProps('clinic-phone', errors.phone, t('hints.phone'))} type="tel" autoComplete="off" className={CONTROL_CLASS} {...form.register('phone')} />
        </Field>
        <Field id="clinic-email" label={t('fields.email')} error={errors.email} required>
          <input {...controlProps('clinic-email', errors.email)} type="email" autoComplete="off" className={CONTROL_CLASS} {...form.register('email')} />
        </Field>
      </div>
      <Field id="clinic-address" label={t('fields.address')} error={errors.address} required>
        <input {...controlProps('clinic-address', errors.address)} autoComplete="off" className={CONTROL_CLASS} {...form.register('address')} />
      </Field>
      <Field id="clinic-hours" label={t('fields.hours')} error={errors.hours} hint={t('hints.hours')} required>
        <input {...controlProps('clinic-hours', errors.hours, t('hints.hours'))} autoComplete="off" className={CONTROL_CLASS} {...form.register('hours')} />
      </Field>
      <FormProblem banner={banner} />
      <div className="flex justify-end">
        <SubmitButton label={t('save')} pendingLabel={t('saving')} isPending={update.isPending} error={update.error} />
      </div>
    </form>
  );
}

export function SettingsPanel(): ReactNode {
  const t = useT('admin.settings');
  const query = useClinicQuery();
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} />
      <QueryState query={query}>{(clinic) => <ClinicForm clinic={clinic} />}</QueryState>
    </>
  );
}
