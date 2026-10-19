'use client';

import type { ReactNode } from 'react';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { formatDayHeading, formatMinskTime, minskDayKeyOf } from './clinic-time';
import type { ScheduleSlot } from './doctor-types';

interface SlotDay {
  readonly dateKey: string;
  readonly slots: ReadonlyArray<ScheduleSlot>;
}

/** Slots (already sorted by start) grouped by clinic day. */
function groupSlotsByDay(slots: ReadonlyArray<ScheduleSlot>): ReadonlyArray<SlotDay> {
  const days = new Map<string, ScheduleSlot[]>();
  slots.forEach((slot) => {
    const key: string = minskDayKeyOf(slot.start);
    days.set(key, [...(days.get(key) ?? []), slot]);
  });
  return [...days.entries()].map(([dateKey, own]) => ({ dateKey, slots: own }));
}

/** `вторник, 20 октября` → `Вторник, 20 октября`: only the weekday gets a capital (CSS `capitalize` would raise the month too). */
function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function SlotTile({ slot }: { readonly slot: ScheduleSlot }): ReactNode {
  return (
    <li className="flex items-center justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
      <span className="mono">{formatMinskTime(slot.start)}–{formatMinskTime(slot.end)}</span>
      <StampBadge status={slot.status} />
    </li>
  );
}

/** The doctor's slots of the chosen period, one block per clinic day; free ones can still be booked, busy ones are taken. */
export function ScheduleSlotDays({ slots }: { readonly slots: ReadonlyArray<ScheduleSlot> }): ReactNode {
  const t = useT('doctor.schedule');
  const days = groupSlotsByDay(slots);
  if (days.length === 0) return null;
  return (
    <div className="mt-3 grid gap-5">
      {days.map((day) => {
        const busy: number = day.slots.filter((slot) => slot.status === 'busy').length;
        return (
          <section key={day.dateKey} aria-labelledby={`day-${day.dateKey}`}>
            <h3 id={`day-${day.dateKey}`} className="text-base font-semibold">
              {upperFirst(formatDayHeading(day.dateKey))}{' '}
              <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">{t('dayCounts', { busy, total: day.slots.length })}</span>
            </h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {day.slots.map((slot) => <SlotTile key={slot.id} slot={slot} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
