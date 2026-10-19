'use client';

import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { FormProblem } from '../shared/admin-problem';
import { CONTROL_CLASS } from '../shared/admin-styles';
import type { ServerFieldRule } from '../shared/apply-server-error';
import { controlProps, Field } from '../shared/form-field';
import { FormActions } from '../shared/form-actions';
import { messagesOf, type FieldMessages } from '../shared/form-errors';
import { Modal } from '../shared/modal';
import { useFormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { EMPTY_SERVICE_VALUES, serviceSchema, serviceValuesOf, toServicePayload, type ServiceFormValues } from './service-schema';
import type { AdminService } from './service-types';
import { useCreateService, useUpdateService } from './use-admin-services';

type ServiceField = keyof ServiceFormValues;
const FIELDS: ReadonlyArray<string> = ['name', 'typeSystem', 'typeCode', 'defaultDurationMin', 'description'];

interface FieldsProps {
  readonly register: (name: ServiceField) => UseFormRegisterReturn;
  readonly errors: FieldMessages<ServiceField>;
}

function CodeFields({ register, errors }: FieldsProps): ReactNode {
  const t = useT('admin.services');
  return (
    <>
      <Field id="service-type-system" label={t('fields.typeSystem')} error={errors.typeSystem} required>
        <input {...controlProps('service-type-system', errors.typeSystem)} className={`${CONTROL_CLASS} mono`} {...register('typeSystem')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="service-type-code" label={t('fields.typeCode')} error={errors.typeCode} hint={t('hints.typeCode')} required>
          <input {...controlProps('service-type-code', errors.typeCode, t('hints.typeCode'))} className={`${CONTROL_CLASS} mono`} {...register('typeCode')} />
        </Field>
        <Field id="service-duration" label={t('fields.defaultDurationMin')} error={errors.defaultDurationMin} required>
          <input {...controlProps('service-duration', errors.defaultDurationMin)} type="number" inputMode="numeric" className={CONTROL_CLASS} {...register('defaultDurationMin')} />
        </Field>
      </div>
    </>
  );
}

function ServiceFields({ register, errors }: FieldsProps): ReactNode {
  const t = useT('admin.services');
  return (
    <div className="mt-4 grid gap-3">
      <Field id="service-name" label={t('fields.name')} error={errors.name} required>
        <input {...controlProps('service-name', errors.name)} autoComplete="off" className={CONTROL_CLASS} {...register('name')} />
      </Field>
      <CodeFields register={register} errors={errors} />
      <Field id="service-description" label={t('fields.description')} error={errors.description}>
        <textarea {...controlProps('service-description', errors.description)} rows={3} className={CONTROL_CLASS} {...register('description')} />
      </Field>
    </div>
  );
}

function ServiceForm({ service, onClose }: { readonly service?: AdminService; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.services');
  const tProblems = useT('admin.problems');
  const resolve = useFormMessage();
  const create = useCreateService();
  const update = useUpdateService();
  const mutation = service === undefined ? create : update;
  const form = useForm<ServiceFormValues>({ resolver: zodResolver(serviceSchema), defaultValues: service === undefined ? EMPTY_SERVICE_VALUES : serviceValuesOf(service) });
  const { register, handleSubmit, formState } = form;
  const rules: Readonly<Record<string, ServerFieldRule>> = { TERMINOLOGY_NOT_FOUND: { field: 'typeCode', message: tProblems('TERMINOLOGY_NOT_FOUND') } };
  const { banner, fail, clear } = useFormBanner(form, FIELDS, rules);
  const submit = handleSubmit((values) => {
    clear();
    const payload = toServicePayload(values, service !== undefined);
    if (service === undefined) create.mutate(payload, { onSuccess: onClose, onError: fail });
    else update.mutate({ id: service.id, payload }, { onSuccess: onClose, onError: fail });
  }, clear);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <ServiceFields register={register} errors={messagesOf<ServiceField, ServiceFormValues>(formState.errors, resolve)} />
      <FormProblem banner={banner} />
      <FormActions submitLabel={service === undefined ? t('create') : t('save')} isPending={mutation.isPending} onCancel={onClose} error={mutation.error} />
    </form>
  );
}

interface ServiceFormDialogProps {
  readonly service?: AdminService;
  readonly onClose: () => void;
}

/** Create (`POST /admin/services`) or edit (`PATCH`) dialog of a service (FR-016). */
export function ServiceFormDialog({ service, onClose }: ServiceFormDialogProps): ReactNode {
  const t = useT('admin.services');
  return (
    <Modal title={service === undefined ? t('createTitle') : t('editTitle')} onClose={onClose}>
      <ServiceForm {...(service === undefined ? {} : { service })} onClose={onClose} />
    </Modal>
  );
}
