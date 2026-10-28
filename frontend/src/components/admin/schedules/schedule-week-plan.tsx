'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { buildWeekPlan, type PlanGrouping, type PlanRow } from './schedule-week-plan-model';
import { WEEK_DAYS, type AdminSchedule, type WeekDay } from './schedule-types';
import { labelOf, type SchedulePickers } from './use-schedule-pickers';

interface SchedulesWeekPlanProps {
  readonly schedules: ReadonlyArray<AdminSchedule>;
  readonly pickers: SchedulePickers;
  readonly grouping: PlanGrouping;
}

function PlanCell({ row, day, grouping }: { readonly row: PlanRow; readonly day: WeekDay; readonly grouping: PlanGrouping }): ReactNode {
  const entries = row.days[day];
  if (entries.length === 0) return <span aria-hidden="true" className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li
          key={`${entry.times}-${entry.where}`}
          title={`${entry.times} · ${entry.where}`}
          className={cn('rounded-control border-l-4 border-primary bg-primary-soft px-2 py-1 text-primary-soft-foreground')}
        >
          <span className="tabular-nums block whitespace-nowrap text-xs font-semibold">{entry.times}</span>
          <span className={cn('block truncate text-xs font-normal', grouping === 'room' && 'max-w-[7.5rem]')}>{entry.where}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Неделя» of the schedule list: a row per doctor (or room), a column per weekday, each window a tinted block with the room (or
 * the doctor) under its hours. The first column stays in view while the days scroll sideways on a narrow screen.
 */
export function SchedulesWeekPlan({ schedules, pickers, grouping }: SchedulesWeekPlanProps): ReactNode {
  const t = useT('admin.schedules');
  const rows = buildWeekPlan(schedules, grouping, {
    doctor: (id) => labelOf(pickers.allDoctors, id),
    room: (id) => labelOf(pickers.rooms, id),
  });
  return (
    <div className="max-h-[min(75vh,56rem)] overflow-auto rounded-card border border-border-soft bg-card shadow-elev-1">
      <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
        <caption className="sr-only">{t('week.caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-20 w-44 bg-secondary px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground shadow-[0_1px_0_var(--border)]">
              {grouping === 'doctor' ? t('columns.doctor') : t('columns.room')}
            </th>
            {WEEK_DAYS.map((day) => (
              <th key={day} scope="col" className="sticky top-0 z-10 bg-secondary px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground shadow-[0_1px_0_var(--border)]">
                {t(`days.${day}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border-soft align-top">
              <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2.5 text-left text-sm font-semibold">
                <span className="block truncate" title={row.label}>{row.label}</span>
              </th>
              {WEEK_DAYS.map((day) => (
                <td key={day} className="px-2 py-2"><PlanCell row={row} day={day} grouping={grouping} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
