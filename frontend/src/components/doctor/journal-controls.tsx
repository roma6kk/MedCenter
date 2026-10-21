'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { isDateKey, shiftDateKey } from '@/lib/clinic-time';
import type { AppointmentState } from './doctor-types';

export type StatusFilter = 'all' | AppointmentState;

const STATUS_FILTERS: ReadonlyArray<StatusFilter> = ['all', 'booked', 'fulfilled', 'noshow', 'cancelled'];

interface JournalControlsProps {
  readonly dateKey: string;
  /** Today in the clinic zone: the "Today" button is inert while the journal already shows it. */
  readonly today: string;
  readonly onDateChange: (dateKey: string) => void;
  readonly status: StatusFilter;
  readonly onStatusChange: (status: StatusFilter) => void;
}

const STEP_BUTTON = 'min-h-[44px] min-w-[44px] rounded-[6px] border border-[var(--border)] px-3 py-1';
const FIELD_CLASS = 'mt-1 block min-h-[44px] rounded-[6px] border border-[var(--input)] bg-[var(--card)] px-2';

/** Previous day / the date field / next day / back to today. */
function DayPicker({ dateKey, today, onDateChange }: Pick<JournalControlsProps, 'dateKey' | 'today' | 'onDateChange'>): ReactNode {
  const t = useT('doctor.journal');
  const isToday: boolean = dateKey === today;
  const handleDateInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (isDateKey(event.target.value)) onDateChange(event.target.value);
  };
  return (
    <>
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, -1))} aria-label={t('previousDay')} className={STEP_BUTTON}>
        <span aria-hidden="true">←</span>
      </button>
      <div>
        <label htmlFor="journal-date" className="form-label block">{t('date')}</label>
        <input id="journal-date" type="date" value={dateKey} onChange={handleDateInput} className={FIELD_CLASS} />
      </div>
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, 1))} aria-label={t('nextDay')} className={STEP_BUTTON}>
        <span aria-hidden="true">→</span>
      </button>
      {/* `aria-disabled`, not `disabled`: the pressed button keeps keyboard focus instead of dropping it to the page top. */}
      <button type="button" onClick={() => (isToday ? undefined : onDateChange(today))} aria-disabled={isToday} className={`${STEP_BUTTON} text-sm aria-disabled:opacity-50`}>
        {t('today')}
      </button>
    </>
  );
}

/** The day to show (previous / today / next / any date) and the status filter of the doctor's journal. */
export function JournalControls({ dateKey, today, onDateChange, status, onStatusChange }: JournalControlsProps): ReactNode {
  const t = useT('doctor.journal');
  const tStamp = useT('stamp');
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <DayPicker dateKey={dateKey} today={today} onDateChange={onDateChange} />
      <div>
        <label htmlFor="journal-status" className="form-label block">{t('statusFilter')}</label>
        <select id="journal-status" value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)} className={FIELD_CLASS}>
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>{option === 'all' ? t('statusAll') : tStamp(option)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
