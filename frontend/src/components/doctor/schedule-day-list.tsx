'use client';

import type { ReactNode } from 'react';
import { SlotDayStrip, type StripDay } from '@/components/booking/slot-day-strip';
import { formatDayHeading } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { SlotBlock } from './schedule-slot-block';
import { DayLoadMeter } from './schedule-week-grid';
import { minutesLabel, type DayLoad, type WeekCalendar } from './schedule-week-model';

interface DayListProps {
  readonly calendar: WeekCalendar;
  readonly selectedDay: string;
  readonly onSelect: (day: string) => void;
}

/** What the strip shows for a day: its free windows; a day without slots is closed (not offered). */
function stripDaysOf(days: ReadonlyArray<DayLoad>): ReadonlyArray<StripDay> {
  return days.map((day) => ({ day: day.dateKey, free: day.total - day.busy, hasSlots: day.total > 0 }));
}

/** The phone's schedule (A10): a strip of the week's days and the slots of the chosen one as a list. */
export function ScheduleDayList({ calendar, selectedDay, onSelect }: DayListProps): ReactNode {
  const t = useT('doctor.schedule');
  const locale = useUiStore((state) => state.locale);
  const day: DayLoad | undefined = calendar.days.find((candidate) => candidate.dateKey === selectedDay);
  return (
    <div className="flex flex-col gap-4">
      <SlotDayStrip days={stripDaysOf(calendar.days)} selectedDay={selectedDay} onSelect={onSelect} messages="doctor.schedule.strip" />
      {day === undefined ? null : (
        <section aria-labelledby="schedule-day-title" className="flex flex-col gap-3 rounded-panel border border-border-soft bg-card p-4 shadow-elev-1">
          <div className="flex flex-col gap-2">
            <h2 id="schedule-day-title" className="text-lg font-bold">{formatDayHeading(day.dateKey, locale)}</h2>
            <DayLoadMeter day={day} />
          </div>
          {day.cells.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noSlotsDay')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {day.cells.map((cell) => (
                <li key={cell.slot.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3">
                  <span className="tabular-nums text-sm font-medium text-muted-foreground">{minutesLabel(cell.minutes)}</span>
                  <SlotBlock cell={cell} layout="list" />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
