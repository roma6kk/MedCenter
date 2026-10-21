'use client';

import { useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { EmptyState, TableSkeleton } from '@/components/feedback/states';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n/use-t';
import { formatDateKey, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ScheduleSlotDays } from './schedule-slot-days';
import { ScheduleWindows } from './schedule-windows';
import { useDoctorSchedule } from './use-doctor-queries';
import { useMinskToday } from './use-minsk-today';

/** The window the page shows at once. The service accepts at most 31 days per request. */
export const SCHEDULE_DAYS = 14;

const STEP_BUTTON = 'min-h-[44px] rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm aria-disabled:opacity-50';

interface PeriodControlsProps {
  readonly fromKey: string;
  readonly today: string;
  readonly onChange: (fromKey: string) => void;
}

/** Earlier / later period, the start date and a jump back to today. */
function PeriodControls({ fromKey, today, onChange }: PeriodControlsProps): ReactNode {
  const t = useT('doctor.schedule');
  const isToday: boolean = fromKey === today;
  const handleDateInput = (event: ChangeEvent<HTMLInputElement>): void => {
    if (isDateKey(event.target.value)) onChange(event.target.value);
  };
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <button type="button" className={STEP_BUTTON} onClick={() => onChange(shiftDateKey(fromKey, -SCHEDULE_DAYS))}>
        <span aria-hidden="true">← </span>{t('previousPeriod')}
      </button>
      <div>
        <label htmlFor="schedule-from" className="form-label block">{t('from')}</label>
        <input id="schedule-from" type="date" value={fromKey} onChange={handleDateInput} className="mt-1 block min-h-[44px] rounded-[6px] border border-[var(--input)] bg-[var(--card)] px-2" />
      </div>
      <button type="button" className={STEP_BUTTON} onClick={() => onChange(shiftDateKey(fromKey, SCHEDULE_DAYS))}>
        {t('nextPeriod')}<span aria-hidden="true"> →</span>
      </button>
      {/* `aria-disabled`, not `disabled`: the pressed button keeps keyboard focus instead of dropping it to the page top. */}
      <button type="button" className={STEP_BUTTON} aria-disabled={isToday} onClick={() => (isToday ? undefined : onChange(today))}>{t('today')}</button>
    </div>
  );
}

/** The signed-in doctor's own schedule (API 5.2.7, FR-009): weekly windows plus the slots of a 14-day period. */
export function DoctorScheduleView(): ReactNode {
  const t = useT('doctor.schedule');
  useDocumentTitle(t('title'));
  const today: string = useMinskToday();
  const [fromKey, setFromKey] = useState<string>(today);
  const toKey: string = shiftDateKey(fromKey, SCHEDULE_DAYS - 1);
  const schedule = useDoctorSchedule({ from: fromKey, to: toKey });

  return (
    <section aria-labelledby="schedule-title">
      <h1 id="schedule-title" className="serif text-2xl font-bold">{t('title')}</h1>
      <PeriodControls fromKey={fromKey} today={today} onChange={setFromKey} />
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('period', { from: formatDateKey(fromKey), to: formatDateKey(toKey) })}</p>
      <div className="mt-4" aria-busy={schedule.isFetching}>
        {schedule.data === undefined ? <QueryFailure query={schedule} embedded notFoundText={t('loadError')} pending={<TableSkeleton />} /> : null}
        {schedule.data ? <ScheduleBody data={schedule.data} /> : null}
      </div>
    </section>
  );
}

function ScheduleBody({ data }: { readonly data: NonNullable<ReturnType<typeof useDoctorSchedule>['data']> }): ReactNode {
  const t = useT('doctor.schedule');
  if (data.schedules.length === 0) return <EmptyState title={t('empty')} description={t('emptyHint')} />;
  return (
    <>
      <ScheduleWindows schedules={data.schedules} />
      <section aria-labelledby="schedule-slots-title" className="mt-6">
        <h2 id="schedule-slots-title" className="serif text-xl font-semibold">{t('slotsTitle')}</h2>
        {data.truncated ? <p role="status" className="mt-2 text-sm text-[var(--warning)]">{t('truncated')}</p> : null}
        {data.items.length === 0 ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('noSlots')}</p> : <ScheduleSlotDays slots={data.items} />}
      </section>
    </>
  );
}
