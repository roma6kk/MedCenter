'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { weekdayShort } from './journal-model';
import { SlotBlock } from './schedule-slot-block';
import { loadPercent, minutesLabel, type CalendarCell, type DayLoad, type WeekCalendar } from './schedule-week-model';

/** «занято N из M» as a small bar and a line of text; a day without slots says so instead of showing an empty bar. */
export function DayLoadMeter({ day }: { readonly day: DayLoad }): ReactNode {
  const t = useT('doctor.schedule');
  if (day.total === 0) return <span className="text-xs font-normal text-muted-foreground">{t('noSlotsDay')}</span>;
  const text: string = t('dayCounts', { busy: day.busy, total: day.total });
  return (
    <span className="flex flex-col gap-1">
      <span
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={day.total}
        aria-valuenow={day.busy}
        className="block h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${loadPercent(day)}%` }} />
      </span>
      <span className="tabular-nums text-xs font-normal text-muted-foreground">{text}</span>
    </span>
  );
}

function cellAt(day: DayLoad, minutes: number): CalendarCell | undefined {
  return day.cells.find((cell) => cell.minutes === minutes);
}

interface WeekGridProps {
  readonly calendar: WeekCalendar;
  readonly today: string;
}

/**
 * The week as a table (A10): a column per day, a row per start time. Only the cells that hold a slot are drawn, so the lunch
 * break and the days off stay empty. The header of each day carries its load.
 */
export function ScheduleWeekGrid({ calendar, today }: WeekGridProps): ReactNode {
  const t = useT('doctor.schedule');
  const locale = useUiStore((state) => state.locale);
  return (
    <div className="overflow-x-auto rounded-panel border border-border-soft bg-card p-3 shadow-elev-1">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1">
        <caption className="sr-only">{t('gridCaption')}</caption>
        <colgroup>
          <col className="w-16" />
          {calendar.days.map((day) => <col key={day.dateKey} />)}
        </colgroup>
        <thead>
          <tr>
            <td />
            {calendar.days.map((day) => {
              const isToday: boolean = day.dateKey === today;
              return (
                <th key={day.dateKey} scope="col" className={cn('rounded-control px-2 py-2 text-left align-top font-semibold', isToday ? 'bg-primary-soft text-primary-soft-foreground' : 'text-foreground')}>
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-xs uppercase">{weekdayShort(day.dateKey, locale)}</span>
                    <span className="text-lg font-bold">{Number.parseInt(day.dateKey.slice(8), 10)}</span>
                  </span>
                  <DayLoadMeter day={day} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {calendar.rows.map((minutes) => (
            <tr key={minutes}>
              <th scope="row" className="tabular-nums pr-1 text-right text-xs font-medium text-muted-foreground">{minutesLabel(minutes)}</th>
              {calendar.days.map((day) => {
                const cell: CalendarCell | undefined = cellAt(day, minutes);
                return <td key={day.dateKey} className="p-0">{cell === undefined ? null : <SlotBlock cell={cell} layout="grid" />}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
