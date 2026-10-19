'use client';

import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { labelOf, type SchedulePickers } from './use-schedule-pickers';
import type { ScheduleFormValues } from './schedule-schema';
import { OptionSelect } from '../shared/option-select';
import { SLOT_DURATION_MAX, SLOT_DURATION_MIN } from './schedule-schema';

interface ActorFieldsProps {
  readonly form: UseFormReturn<ScheduleFormValues>;
  readonly pickers: SchedulePickers;
  readonly errors: Readonly<Partial<Record<'practitionerRoleId' | 'roomId' | 'serviceId', string>>>;
}

/** The slot duration follows the service's default until the admin types their own. */
function useServiceDuration(form: UseFormReturn<ScheduleFormValues>, pickers: SchedulePickers): (serviceId: string) => void {
  return (serviceId) => {
    const service = pickers.services.find((option) => option.value === serviceId);
    if (service === undefined || form.formState.dirtyFields.slotDurationMin === true) return;
    const minutes: number = Math.min(Math.max(service.durationMin, SLOT_DURATION_MIN), SLOT_DURATION_MAX);
    form.setValue('slotDurationMin', String(minutes));
  };
}

/** Pickers of the three actors, fed by the doctor, room and service lists; chosen at creation, fixed afterwards. */
export function ScheduleActorFields({ form, pickers, errors }: ActorFieldsProps): ReactNode {
  const t = useT('admin.schedules');
  const applyDuration = useServiceDuration(form, pickers);
  const { register } = form;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {pickers.isTruncated ? <p role="status" className="text-xs text-[var(--muted-foreground)] sm:col-span-3">{t('pickersTruncated')}</p> : null}
      <OptionSelect id="schedule-doctor" label={t('fields.doctor')} placeholder={t('choose')} options={pickers.doctors} registration={register('practitionerRoleId')} error={errors.practitionerRoleId} required />
      <OptionSelect id="schedule-room" label={t('fields.room')} placeholder={t('choose')} options={pickers.rooms} registration={register('roomId')} error={errors.roomId} required />
      <OptionSelect
        id="schedule-service"
        label={t('fields.service')}
        placeholder={t('choose')}
        options={pickers.services}
        registration={register('serviceId', { onChange: (event: { target: { value: string } }) => applyDuration(event.target.value) })}
        error={errors.serviceId}
        required
      />
    </div>
  );
}

/** Read-only summary of the actors of an existing schedule (the API does not let them change). */
export function ScheduleActorSummary({ values, pickers }: { readonly values: ScheduleFormValues; readonly pickers: SchedulePickers }): ReactNode {
  const t = useT('admin.schedules');
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <div>
        <dt className="form-label">{t('fields.doctor')}</dt>
        <dd>{labelOf(pickers.allDoctors, values.practitionerRoleId)}</dd>
      </div>
      <div>
        <dt className="form-label">{t('fields.room')}</dt>
        <dd>{labelOf(pickers.rooms, values.roomId)}</dd>
      </div>
      <div>
        <dt className="form-label">{t('fields.service')}</dt>
        <dd>{labelOf(pickers.services, values.serviceId)}</dd>
      </div>
    </dl>
  );
}
