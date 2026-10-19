'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { WEEK_DAYS, type WeeklyWindow } from './schedule-types';
import { findOverlappingWindows, isWindowValid, windowsOfDay } from './schedule-windows';

/** The week at a glance, MO–SU: what the windows add up to, with overlapping windows struck out in red. */
export function ScheduleWeekPreview({ windows }: { readonly windows: ReadonlyArray<WeeklyWindow> }): ReactNode {
  const t = useT('admin.schedules');
  const overlapping = findOverlappingWindows(windows);
  const marked = new Set(windows.filter((_, index) => overlapping.has(index)));
  return (
    <div aria-label={t('preview.label')} role="group" className="grid grid-cols-7 gap-1 text-center text-xs">
      {WEEK_DAYS.map((day) => (
        <div key={day} className="rounded-[6px] border border-[var(--border)] p-1">
          <p className="font-semibold">{t(`days.${day}`)}</p>
          {windowsOfDay(windows.filter(isWindowValid), day).map((window, position) => (
            <p key={`${window.startTime}-${window.endTime}-${position}`} className={`mono ${marked.has(window) ? 'text-[var(--destructive)]' : ''}`}>
              {window.startTime}–{window.endTime}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
