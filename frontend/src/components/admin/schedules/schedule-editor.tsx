'use client';

import type { BaseSyntheticEvent, ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { ScheduleActorFields, ScheduleActorSummary } from './schedule-actor-fields';
import { emptyScheduleValues, scheduleSchemaFor, scheduleValuesOf, toCreateSchedulePayload, toUpdateSchedulePayload, type ScheduleFormValues, type ScheduleMode } from './schedule-schema';
import type { AdminSchedule } from './schedule-types';
import { ScheduleWeekPreview } from './schedule-week-preview';
import { ScheduleWindowsEditor } from './schedule-windows-editor';
import { FormProblem } from '../shared/admin-problem';
import { CONTROL_CLASS } from '../shared/admin-styles';
import { FormActions } from '../shared/form-actions';
import { messagesOf } from '../shared/form-errors';
import { controlProps, Field } from '../shared/form-field';
import { problemOf } from '../shared/problem-of';
import { useFormBanner, type FormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { useCreateSchedule, useUpdateSchedule } from './use-admin-schedules';
import type { SchedulePickers } from './use-schedule-pickers';

const FIELDS: ReadonlyArray<string> = ['practitionerRoleId', 'roomId', 'serviceId', 'horizonFrom', 'horizonTo', 'slotDurationMin', 'comment'];

type ScalarField = 'practitionerRoleId' | 'roomId' | 'serviceId' | 'horizonFrom' | 'horizonTo' | 'slotDurationMin' | 'comment';

function PeriodFields({ form, errors }: { readonly form: UseFormReturn<ScheduleFormValues>; readonly errors: Readonly<Partial<Record<ScalarField, string>>> }): ReactNode {
  const t = useT('admin.schedules');
  const { register } = form;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field id="schedule-horizon-from" label={t('fields.horizonFrom')} error={errors.horizonFrom} required>
        <input {...controlProps('schedule-horizon-from', errors.horizonFrom)} type="date" className={CONTROL_CLASS} {...register('horizonFrom')} />
      </Field>
      <Field id="schedule-horizon-to" label={t('fields.horizonTo')} error={errors.horizonTo} hint={t('hints.horizon')} required>
        <input {...controlProps('schedule-horizon-to', errors.horizonTo, t('hints.horizon'))} type="date" className={CONTROL_CLASS} {...register('horizonTo')} />
      </Field>
      <Field id="schedule-duration" label={t('fields.slotDurationMin')} error={errors.slotDurationMin} required>
        <input {...controlProps('schedule-duration', errors.slotDurationMin)} type="number" inputMode="numeric" className={CONTROL_CLASS} {...register('slotDurationMin')} />
      </Field>
    </div>
  );
}

interface ScheduleEditorProps {
  /** The schedule to edit; omitted → create a new one. */
  readonly schedule?: AdminSchedule;
  readonly pickers: SchedulePickers;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

interface ScheduleSubmit {
  readonly isPending: boolean;
  /** The failure of the last submit, for the 429 cooldown and the overlap marks. */
  readonly error: Error | null;
  /** What is left for the banner after the fields took their messages. */
  readonly banner: FormBanner | null;
  readonly submit: (event?: BaseSyntheticEvent) => Promise<void>;
}

function useScheduleSubmit(mode: ScheduleMode, schedule: AdminSchedule | undefined, form: UseFormReturn<ScheduleFormValues>, onDone: () => void): ScheduleSubmit {
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const { banner, fail, clear } = useFormBanner(form, FIELDS);
  const callbacks = { onSuccess: onDone, onError: fail };
  const submit = form.handleSubmit(
    (values) => {
      clear();
      if (mode === 'create' || schedule === undefined) create.mutate(toCreateSchedulePayload(values), callbacks);
      else update.mutate({ id: schedule.id, payload: toUpdateSchedulePayload(values) }, callbacks);
    },
    clear,
  );
  const mutation = mode === 'create' ? create : update;
  return { isPending: mutation.isPending, error: mutation.error, banner, submit };
}

/**
 * The schedule editor (FR-020): doctor / room / service pickers, planning horizon (≤ 90 days), slot duration and the weekly
 * windows MO–SU. It produces `CreateScheduleDto`; for an existing schedule only horizon, windows, duration and comment change.
 */
export function ScheduleEditor({ schedule, pickers, onDone, onCancel }: ScheduleEditorProps): ReactNode {
  const t = useT('admin.schedules');
  const resolve = useFormMessage();
  const mode: ScheduleMode = schedule === undefined ? 'create' : 'edit';
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchemaFor(mode)),
    defaultValues: schedule === undefined ? emptyScheduleValues() : scheduleValuesOf(schedule),
  });
  const { isPending, error, banner, submit } = useScheduleSubmit(mode, schedule, form, onDone);
  const errors = messagesOf<ScalarField, ScheduleFormValues>(form.formState.errors, resolve);
  const serverOverlap: boolean = problemOf(banner?.error)?.errorCode === 'SCHEDULE_OVERLAP';
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="mt-4 grid gap-4">
      {mode === 'create' ? <ScheduleActorFields form={form} pickers={pickers} errors={errors} /> : <ScheduleActorSummary values={form.getValues()} pickers={pickers} />}
      <PeriodFields form={form} errors={errors} />
      <ScheduleWindowsEditor form={form} serverOverlap={serverOverlap} />
      <ScheduleWeekPreview windows={form.watch('windows')} />
      <Field id="schedule-comment" label={t('fields.comment')} error={errors.comment}>
        <input {...controlProps('schedule-comment', errors.comment)} autoComplete="off" className={CONTROL_CLASS} {...form.register('comment')} />
      </Field>
      <FormProblem banner={banner} {...(serverOverlap ? { title: t('overlapTitle') } : {})} />
      <FormActions submitLabel={mode === 'create' ? t('create') : t('save')} isPending={isPending} onCancel={onCancel} error={error} />
    </form>
  );
}
