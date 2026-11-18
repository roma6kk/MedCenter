'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { controlProps, Field } from '../shared/form-field';
import { validateReportRange } from '../shared/report-range';
import { useDebouncedCommit } from '../shared/use-debounced-commit';
import { useAdminUsers } from '../users/use-admin-users';
import { referenceId } from '../users/user-types';
import { ADMIN_APPOINTMENT_STATUSES, defaultAdminAppointmentFilter, type AdminAppointmentFilter } from './admin-appointment-filter';

interface AdminAppointmentsFiltersProps {
  readonly filter: AdminAppointmentFilter;
  readonly onApply: (filter: AdminAppointmentFilter) => void;
}

const sameFilter = (a: AdminAppointmentFilter, b: AdminAppointmentFilter): boolean => a.from === b.from && a.to === b.to && a.doctorId === b.doctorId && a.status === b.status;

// A schedule's doctor is a PractitionerRole, which only the DOCTOR accounts carry (the same source as the schedules page).
function useDoctorOptions(): ReadonlyArray<{ readonly value: string; readonly label: string }> {
  const users = useAdminUsers({ page: 1, role: 'DOCTOR', search: '', pageSize: 100 });
  return useMemo(
    () => (users.data?.items ?? []).filter((user) => user.practitionerRoleRef !== null).map((user) => ({ value: referenceId(user.practitionerRoleRef), label: user.name })),
    [users.data],
  );
}

export function AdminAppointmentsFilters({ filter, onApply }: AdminAppointmentsFiltersProps): ReactNode {
  const t = useT('admin.appointments');
  const doctors = useDoctorOptions();
  const [draft, setDraft] = useState<AdminAppointmentFilter>(filter);
  const [rangeError, setRangeError] = useState<string | undefined>(undefined);
  useDebouncedCommit(
    draft,
    filter,
    (next) => {
      const error = validateReportRange(next);
      setRangeError(error === null ? undefined : t(`errors.${error}`));
      if (error === null) onApply(next);
    },
    sameFilter,
  );
  const handleReset = (): void => {
    const initial = defaultAdminAppointmentFilter();
    setDraft(initial);
    setRangeError(undefined);
    onApply(initial);
  };
  const shownError: string | undefined = sameFilter(draft, filter) ? undefined : rangeError;
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={(event) => event.preventDefault()} noValidate className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-card border border-[var(--border)] bg-[var(--card)] p-4">
      <Field id="appointments-from" label={t('filters.from')}>
        <DatePicker {...controlProps('appointments-from', shownError)} value={draft.from} onChange={(from) => setDraft({ ...draft, from })} wrapperClassName="w-44" />
      </Field>
      <Field id="appointments-to" label={t('filters.to')}>
        <DatePicker id="appointments-to" value={draft.to} aria-invalid={shownError ? true : undefined} aria-describedby={shownError ? 'appointments-from-error' : undefined} onChange={(to) => setDraft({ ...draft, to })} wrapperClassName="w-44" />
      </Field>
      <Field id="appointments-doctor" label={t('filters.doctor')}>
        <Select id="appointments-doctor" value={draft.doctorId} onChange={(event) => setDraft({ ...draft, doctorId: event.target.value })}>
          <option value="">{t('filters.anyDoctor')}</option>
          {doctors.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </Field>
      <Field id="appointments-status" label={t('filters.status')}>
        <Select id="appointments-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminAppointmentFilter['status'] })}>
          <option value="">{t('filters.anyStatus')}</option>
          {ADMIN_APPOINTMENT_STATUSES.map((status) => (
            <option key={status} value={status}>{t(`statuses.${status}`)}</option>
          ))}
        </Select>
      </Field>
      <button type="button" onClick={handleReset} className={SECONDARY_BUTTON_CLASS}>{t('filters.reset')}</button>
      {shownError ? <p id="appointments-from-error" role="alert" className="basis-full text-xs text-[var(--destructive)]">{shownError}</p> : null}
    </form>
  );
}
