'use client';

import { useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import { STAFF_ASIDE_SLOT_ID } from '@/components/layout/staff-shell';
import { formatClinicTime, formatDayHeading } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import type { AppointmentState, DoctorJournalPage, JournalAppointment } from './doctor-types';
import { HALF_HOUR_PX, gridRange, layoutBlocks, shortName, weekdayShort, type WeekBlock } from './journal-model';

const BLOCK_STYLE: Readonly<Record<AppointmentState, string>> = {
  booked: 'border-primary bg-primary text-primary-foreground',
  fulfilled: 'border-success bg-success-soft text-success',
  noshow: 'border-warning bg-warning-soft text-warning',
  cancelled: 'border-dashed border-input bg-card text-muted-foreground',
};

const LEGEND_ROWS: ReadonlyArray<{ readonly status: AppointmentState; readonly labelKey: string }> = [
  { status: 'booked', labelKey: 'legendBooked' },
  { status: 'fulfilled', labelKey: 'legendFulfilled' },
  { status: 'noshow', labelKey: 'legendNoshow' },
  { status: 'cancelled', labelKey: 'legendCancelled' },
];

/** The legend belongs in the shell's sidebar; a page rendered without that shell keeps it under the grid. */
function useAsideSlot(): HTMLElement | null | undefined {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useLayoutEffect(() => setSlot(document.getElementById(STAFF_ASIDE_SLOT_ID)), []);
  return slot;
}

function Legend(): ReactNode {
  const t = useT('doctor.journal');
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-background p-3.5 text-[13px]">
      <p className="text-sm font-bold">{t('legendTitle')}</p>
      <ul className="flex flex-col gap-2.5">
        {LEGEND_ROWS.map((row) => (
          <li key={row.status} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-3.5 shrink-0 rounded-[4px] border', BLOCK_STYLE[row.status])} />
            {t(row.labelKey)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Block({ block }: { readonly block: WeekBlock }): ReactNode {
  const t = useT('doctor.journal');
  const tStamp = useT('stamp');
  const { visit } = block;
  const name: string = visit.patientName ?? t('unknownPatient', { id: visit.patientId });
  const label = `${formatClinicTime(visit.start)} ${visit.patientName ? shortName(visit.patientName) : name}`;
  return (
    <li className="absolute box-border p-0.5" style={{ top: block.top, height: block.height, left: `${block.left}%`, width: `${block.width}%` }}>
      <Link
        href={`/patients/${encodeURIComponent(visit.patientId)}`}
        aria-label={`${formatClinicTime(visit.start)} ${name}, ${tStamp(visit.status)}. ${t('patientCard')}`}
        title={`${name} · ${tStamp(visit.status)}`}
        className={cn('flex h-full flex-col justify-center overflow-hidden rounded-card border px-2 no-underline', BLOCK_STYLE[visit.status])}
      >
        <span className="truncate text-xs font-semibold">{label}</span>
      </Link>
    </li>
  );
}

export interface DayColumn {
  readonly dateKey: string;
  readonly query: UseQueryResult<DoctorJournalPage>;
  readonly visits: ReadonlyArray<JournalAppointment>;
}

interface JournalWeekViewProps {
  readonly days: ReadonlyArray<DayColumn>;
  readonly today: string;
  /** A day heading opens that day in the day view. */
  readonly onOpenDay: (dateKey: string) => void;
}

/** Week view: five working days side by side, every visit a block at its time on a half-hour grid. */
export function JournalWeekView({ days, today, onOpenDay }: JournalWeekViewProps): ReactNode {
  const t = useT('doctor.journal');
  const locale = useUiStore((state) => state.locale);
  const slot = useAsideSlot();
  const { startHour, endHour } = gridRange(days.map((day) => day.visits));
  const height: number = (endHour - startHour) * 2 * HALF_HOUR_PX;
  const hours: ReadonlyArray<number> = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-x-auto rounded-panel border border-border bg-card">
        <div className="grid min-w-[820px] grid-cols-[64px_repeat(5,minmax(0,1fr))]" aria-label={t('weekGridLabel')} role="group">
          <div className="border-b border-border" />
          {days.map((day) => {
            const isToday: boolean = day.dateKey === today;
            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => onOpenDay(day.dateKey)}
                aria-label={t('openDay', { date: formatDayHeading(day.dateKey) })}
                className={cn(
                  'flex min-h-11 flex-col gap-0.5 border-b border-l border-border px-3 py-3.5 text-left hover:bg-secondary',
                  isToday ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-card text-foreground',
                )}
              >
                <span className="text-[13px] font-semibold uppercase tracking-[0.05em]">{weekdayShort(day.dateKey, locale)}{isToday ? ` · ${t('todayEyebrow').toLowerCase()}` : ''}</span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[22px] font-bold">{day.dateKey.slice(8)}</span>
                  <span className="text-[13px] text-muted-foreground">{day.query.isSuccess ? t('dayCount', { count: day.visits.length }) : '…'}</span>
                </span>
              </button>
            );
          })}
          <div aria-hidden="true" className="relative" style={{ height }}>
            {hours.map((hour, index) => (
              <span key={hour} className="mono absolute right-2 -translate-y-1/2 text-xs font-medium text-muted-foreground" style={{ top: index * 2 * HALF_HOUR_PX + 8 }}>
                {`${String(hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <ul
              key={day.dateKey}
              aria-label={formatDayHeading(day.dateKey)}
              className={cn('relative border-l border-border', day.dateKey === today ? 'bg-background' : 'bg-card')}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${2 * HALF_HOUR_PX}px)`,
              }}
            >
              {layoutBlocks(day.visits, startHour).map((block) => <Block key={block.visit.id} block={block} />)}
              {day.query.isSuccess && day.visits.length === 0 ? (
                <li className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">{t('weekEmpty')}</li>
              ) : null}
            </ul>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('weekHint')}</p>
      {slot === undefined ? null : slot === null ? <Legend /> : createPortal(<Legend />, slot)}
    </div>
  );
}
