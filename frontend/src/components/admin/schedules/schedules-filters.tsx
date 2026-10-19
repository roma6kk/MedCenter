'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS } from '../shared/admin-styles';
import type { SchedulesFilter } from './use-admin-schedules';
import type { SchedulePickers } from './use-schedule-pickers';

interface SchedulesFiltersProps {
  readonly filter: SchedulesFilter;
  readonly pickers: SchedulePickers;
  readonly onChange: (filter: SchedulesFilter) => void;
}

/** Doctor and status filters of the schedule list; they apply at once (a select is one decision, not typing). */
export function SchedulesFilters({ filter, pickers, onChange }: SchedulesFiltersProps): ReactNode {
  const t = useT('admin.schedules');
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3" role="group" aria-label={t('filters.label')}>
      <div className="grid gap-1">
        <label htmlFor="schedules-filter-doctor" className="form-label">{t('filters.doctor')}</label>
        <select id="schedules-filter-doctor" value={filter.doctorId} onChange={(event) => onChange({ ...filter, page: 1, doctorId: event.target.value })} className={CONTROL_CLASS}>
          <option value="">{t('filters.anyDoctor')}</option>
          {pickers.allDoctors.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor="schedules-filter-active" className="form-label">{t('filters.status')}</label>
        <select id="schedules-filter-active" value={filter.active} onChange={(event) => onChange({ ...filter, page: 1, active: event.target.value as SchedulesFilter['active'] })} className={CONTROL_CLASS}>
          <option value="">{t('filters.anyStatus')}</option>
          <option value="true">{t('filters.activeOnly')}</option>
          <option value="false">{t('filters.inactiveOnly')}</option>
        </select>
      </div>
    </div>
  );
}
