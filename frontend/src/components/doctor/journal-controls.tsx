'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { cn } from '@/lib/ui/cn';
import type { AppointmentState } from './doctor-types';

export type StatusFilter = 'all' | AppointmentState;
export type JournalView = 'day' | 'week';

const STATUS_FILTERS: ReadonlyArray<StatusFilter> = ['all', 'booked', 'fulfilled', 'noshow', 'cancelled'];
const VIEWS: ReadonlyArray<JournalView> = ['day', 'week'];
/** The week view moves by calendar weeks, the day view by days. */
const STEP_DAYS: Readonly<Record<JournalView, number>> = { day: 1, week: 7 };

interface JournalControlsProps {
  readonly dateKey: string;
  /** Today in the clinic zone: the "Today" button is inert while the journal already shows it. */
  readonly today: string;
  readonly view: JournalView;
  readonly onViewChange: (view: JournalView) => void;
  readonly onDateChange: (dateKey: string) => void;
  readonly status: StatusFilter;
  readonly onStatusChange: (status: StatusFilter) => void;
}

const STEP_BUTTON = 'inline-flex size-11 items-center justify-center text-foreground hover:bg-secondary';

/** Previous / the date field / next: the day (day view) or the first day of the week (week view). */
function PeriodPicker({ dateKey, view, onDateChange }: Pick<JournalControlsProps, 'dateKey' | 'view' | 'onDateChange'>): ReactNode {
  const t = useT('doctor.journal');
  const step: number = STEP_DAYS[view];
  const handleDateInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (isDateKey(event.target.value)) onDateChange(event.target.value);
  };
  return (
    <div role="group" aria-label={t('periodLabel')} className="inline-flex items-center overflow-hidden rounded-[12px] border border-border bg-card">
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, -step))} aria-label={view === 'day' ? t('previousDay') : t('previousWeek')} className={STEP_BUTTON}>
        <ChevronLeft aria-hidden="true" className="size-[18px]" />
      </button>
      <label htmlFor="journal-date" className="sr-only">{view === 'day' ? t('date') : t('weekStart')}</label>
      <input
        id="journal-date"
        type="date"
        value={dateKey}
        onChange={handleDateInput}
        className="mono min-h-11 border-x border-border bg-transparent px-3 text-[15px] font-medium text-foreground"
      />
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, step))} aria-label={view === 'day' ? t('nextDay') : t('nextWeek')} className={STEP_BUTTON}>
        <ChevronRight aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}

/** Segmented switch between the day timeline and the week grid. */
function ViewToggle({ view, onViewChange }: Pick<JournalControlsProps, 'view' | 'onViewChange'>): ReactNode {
  const t = useT('doctor.journal');
  return (
    <div role="group" aria-label={t('viewLabel')} className="inline-flex gap-0.5 rounded-[12px] bg-secondary p-0.5">
      {VIEWS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onViewChange(option)}
          className={cn(
            'min-h-11 rounded-[10px] px-4 text-sm transition-colors',
            view === option ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {option === 'day' ? t('viewDay') : t('viewWeek')}
        </button>
      ))}
    </div>
  );
}

/** The period to show (previous / any date / next / today), the day-or-week switch and the status filter of the doctor's journal. */
export function JournalControls({ dateKey, today, view, onViewChange, onDateChange, status, onStatusChange }: JournalControlsProps): ReactNode {
  const t = useT('doctor.journal');
  const tStamp = useT('stamp');
  const isToday: boolean = dateKey === today;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <PeriodPicker dateKey={dateKey} view={view} onDateChange={onDateChange} />
      {/* `aria-disabled`, not `disabled`: the pressed button keeps keyboard focus instead of dropping it to the page top. */}
      <button type="button" onClick={() => (isToday ? undefined : onDateChange(today))} aria-disabled={isToday} className={buttonVariants({ variant: 'secondary' })}>
        {t('today')}
      </button>
      <ViewToggle view={view} onViewChange={onViewChange} />
      <label htmlFor="journal-status" className="sr-only">{t('statusFilter')}</label>
      <select
        id="journal-status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
        className="min-h-11 rounded-control border border-input bg-card px-3 text-sm"
      >
        {STATUS_FILTERS.map((option) => (
          <option key={option} value={option}>{option === 'all' ? t('statusAll') : tStamp(option)}</option>
        ))}
      </select>
    </div>
  );
}
