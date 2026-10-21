'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { formatDateKey } from '@/lib/clinic-time';
import type { ScheduleSummary, WeekDay, WeeklyWindow } from './doctor-types';

const WEEK_ORDER: ReadonlyArray<WeekDay> = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function windowsOf(day: WeekDay, windows: ReadonlyArray<WeeklyWindow>): ReadonlyArray<WeeklyWindow> {
  return windows.filter((window) => window.dayOfWeek === day);
}

function WeekRow({ day, windows }: { readonly day: WeekDay; readonly windows: ReadonlyArray<WeeklyWindow> }): ReactNode {
  const t = useT('doctor.schedule');
  const own = windowsOf(day, windows);
  return (
    <tr className="border-t border-[var(--border)]">
      <th scope="row" className="h-9 px-3 text-left font-normal">{t(`weekdays.${day}`)}</th>
      <td className="mono h-9 px-3">
        {own.length === 0 ? <span className="text-[var(--muted-foreground)]">{t('dayOff')}</span> : own.map((w) => `${w.startTime}–${w.endTime}`).join(', ')}
      </td>
    </tr>
  );
}

function ScheduleCard({ schedule }: { readonly schedule: ScheduleSummary }): ReactNode {
  const t = useT('doctor.schedule');
  return (
    <article className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-base font-semibold">{schedule.comment ?? t('scheduleFallback')}</h3>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {schedule.slotDurationMin !== undefined ? t('slotDuration', { minutes: schedule.slotDurationMin }) : null}
        {schedule.horizonFrom && schedule.horizonTo ? ` · ${t('horizon', { from: formatDateKey(schedule.horizonFrom), to: formatDateKey(schedule.horizonTo) })}` : null}
      </p>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">{t('windowsCaption')}</caption>
        <tbody>{WEEK_ORDER.map((day) => <WeekRow key={day} day={day} windows={schedule.windows} />)}</tbody>
      </table>
    </article>
  );
}

/** The weekly working windows (MO–SU, clinic time) of each of the doctor's schedules. */
export function ScheduleWindows({ schedules }: { readonly schedules: ReadonlyArray<ScheduleSummary> }): ReactNode {
  const t = useT('doctor.schedule');
  if (schedules.length === 0) return null;
  return (
    <section aria-labelledby="schedule-windows-title" className="mt-6">
      <h2 id="schedule-windows-title" className="serif text-xl font-semibold">{t('windowsTitle')}</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {schedules.map((schedule) => <ScheduleCard key={schedule.id} schedule={schedule} />)}
      </div>
    </section>
  );
}
