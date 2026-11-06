'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { useT } from '@/lib/i18n/use-t';
import { isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { cn } from '@/lib/ui/cn';
import type { AppointmentState } from './doctor-types';

export type StatusFilter = 'all' | AppointmentState;
export type JournalView = 'day' | 'week';

const STATUS_FILTERS: ReadonlyArray<StatusFilter> = ['all', 'booked', 'fulfilled', 'noshow', 'cancelled'];
const VIEWS: ReadonlyArray<JournalView> = ['day', 'week'];
const STEP_DAYS: Readonly<Record<JournalView, number>> = { day: 1, week: 7 };

interface JournalControlsProps {
  readonly dateKey: string;
  readonly today: string;
  readonly view: JournalView;
  readonly onViewChange: (view: JournalView) => void;
  readonly onDateChange: (dateKey: string) => void;
  readonly status: StatusFilter;
  readonly onStatusChange: (status: StatusFilter) => void;
}

const STEP_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-control border border-border bg-card text-foreground transition-[background-color,transform] duration-fast ease-out hover:bg-secondary active:scale-[0.97]';

function PeriodPicker({ dateKey, view, onDateChange }: Pick<JournalControlsProps, 'dateKey' | 'view' | 'onDateChange'>): ReactNode {
  const t = useT('doctor.journal');
  const step: number = STEP_DAYS[view];
  const handleDate = (next: string): void => {
    if (isDateKey(next)) onDateChange(next);
  };
  return (
    <div role="group" aria-label={t('periodLabel')} className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, -step))} aria-label={view === 'day' ? t('previousDay') : t('previousWeek')} className={STEP_BUTTON}>
        <ChevronLeft aria-hidden="true" className="size-[18px]" />
      </button>
      <label htmlFor="journal-date" className="sr-only">{view === 'day' ? t('date') : t('weekStart')}</label>
      <DatePicker id="journal-date" value={dateKey} onChange={handleDate} wrapperClassName="w-44" className="font-medium" />
      <button type="button" onClick={() => onDateChange(shiftDateKey(dateKey, step))} aria-label={view === 'day' ? t('nextDay') : t('nextWeek')} className={STEP_BUTTON}>
        <ChevronRight aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}

function ViewToggle({ view, onViewChange }: Pick<JournalControlsProps, 'view' | 'onViewChange'>): ReactNode {
  const t = useT('doctor.journal');
  return (
    <div role="group" aria-label={t('viewLabel')} className="inline-flex gap-0.5 rounded-control bg-secondary p-0.5">
      {VIEWS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onViewChange(option)}
          className={cn(
            'min-h-11 rounded-sm px-4 text-sm transition-[background-color,color,box-shadow] duration-fast ease-out',
            view === option ? 'bg-card font-semibold text-foreground shadow-elev-1' : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {option === 'day' ? t('viewDay') : t('viewWeek')}
        </button>
      ))}
    </div>
  );
}

export function JournalControls({ dateKey, today, view, onViewChange, onDateChange, status, onStatusChange }: JournalControlsProps): ReactNode {
  const t = useT('doctor.journal');
  const tStamp = useT('stamp');
  const isToday: boolean = dateKey === today;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <PeriodPicker dateKey={dateKey} view={view} onDateChange={onDateChange} />
      {/* aria-disabled, not disabled: the pressed button keeps keyboard focus. */}
      <button type="button" onClick={() => (isToday ? undefined : onDateChange(today))} aria-disabled={isToday} className={buttonVariants({ variant: 'secondary' })}>
        {t('today')}
      </button>
      <ViewToggle view={view} onViewChange={onViewChange} />
      <label htmlFor="journal-status" className="sr-only">{t('statusFilter')}</label>
      <Select id="journal-status" value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)} wrapperClassName="w-auto min-w-[10rem]">
        {STATUS_FILTERS.map((option) => (
          <option key={option} value={option}>{option === 'all' ? t('statusAll') : tStamp(option)}</option>
        ))}
      </Select>
    </div>
  );
}
