'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { DatePicker } from '@/components/ui/date-picker';
import { formatDayShort, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { WEEK_LENGTH } from './schedule-week-model';

const STEP_BUTTON =
  'inline-flex size-11 items-center justify-center rounded-control border border-border bg-card text-foreground transition-[background-color,transform] duration-fast ease-out hover:bg-secondary active:scale-[0.97]';

interface WeekControlsProps {
  readonly weekStart: string;
  readonly anchor: string;
  readonly today: string;
  readonly onChange: (dateKey: string) => void;
}

export function WeekRangeLabel({ weekStart }: { readonly weekStart: string }): ReactNode {
  const locale = useUiStore((state) => state.locale);
  return <>{`${formatDayShort(weekStart, locale)} – ${formatDayShort(shiftDateKey(weekStart, WEEK_LENGTH - 1), locale)}`}</>;
}

export function ScheduleWeekControls({ weekStart, anchor, today, onChange }: WeekControlsProps): ReactNode {
  const t = useT('doctor.schedule');
  const isThisWeek: boolean = weekStart <= today && today < shiftDateKey(weekStart, WEEK_LENGTH);
  const handleDate = (next: string): void => {
    if (isDateKey(next)) onChange(next);
  };
  return (
    <div role="group" aria-label={t('periodLabel')} className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={() => onChange(shiftDateKey(weekStart, -WEEK_LENGTH))} aria-label={t('previousWeek')} className={STEP_BUTTON}>
        <ChevronLeft aria-hidden="true" className="size-[18px]" />
      </button>
      <label htmlFor="schedule-date" className="sr-only">{t('date')}</label>
      <DatePicker id="schedule-date" value={anchor} onChange={handleDate} wrapperClassName="w-44" className="font-medium" />
      <button type="button" onClick={() => onChange(shiftDateKey(weekStart, WEEK_LENGTH))} aria-label={t('nextWeek')} className={STEP_BUTTON}>
        <ChevronRight aria-hidden="true" className="size-[18px]" />
      </button>
      {/* aria-disabled, not disabled: the pressed button keeps keyboard focus. */}
      <button type="button" className={buttonVariants({ variant: 'secondary' })} aria-disabled={isThisWeek} onClick={() => (isThisWeek ? undefined : onChange(today))}>
        {t('today')}
      </button>
    </div>
  );
}
