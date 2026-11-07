'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Ban, CircleAlert, CircleCheck, type LucideIcon } from 'lucide-react';
import type { SlotStatus } from '@/components/feedback/stamp-badge';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicTime, formatDayHeading, groupSlotsByDay, type SlotDay } from '@/lib/clinic-time';
import type { AdminSchedule, ScheduleSlot } from './schedule-types';
import { DatePicker } from '@/components/ui/date-picker';
import { Field } from '../shared/form-field';
import { QueryState } from '../shared/query-state';
import { defaultGenerationRange, validatePeriod, type PeriodError } from './generation-range';
import { countSlots, mayBeTruncated, type SlotCounts } from './slot-grouping';
import { useScheduleSlots, type SlotsQuery } from './use-admin-schedules';
import { Select } from '@/components/ui/select';

const STATUS_FILTERS: ReadonlyArray<SlotStatus | ''> = ['', 'free', 'busy', 'entered-in-error'];
const RANGE_ERROR_ID = 'slots-from-error';

const CHIP_LOOK: Readonly<Record<SlotStatus, { readonly className: string; readonly icon: LucideIcon }>> = {
  free: { className: 'border-border bg-card text-foreground', icon: CircleCheck },
  busy: { className: 'border-transparent bg-secondary text-muted-foreground', icon: Ban },
  'entered-in-error': { className: 'border-warning bg-warning-soft text-warning', icon: CircleAlert },
};

function SlotTile({ slot }: { readonly slot: ScheduleSlot }): ReactNode {
  const tStamp = useT('stamp');
  const { className, icon: Icon } = CHIP_LOOK[slot.status];
  const time: string = `${formatClinicTime(slot.start)}–${formatClinicTime(slot.end)}`;
  return (
    <li data-testid={`slot-${slot.status}`} title={`${time} · ${tStamp(slot.status)}`} className={cn('flex items-center justify-center gap-1.5 rounded-control border px-2 py-1.5 text-sm', className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="tabular-nums">{time}</span>
      <span className="sr-only">{tStamp(slot.status)}</span>
    </li>
  );
}

function SlotCountsLine({ counts, isPartial }: { readonly counts: SlotCounts; readonly isPartial: boolean }): ReactNode {
  const t = useT('admin.slots');
  const values = { total: counts.total, free: counts.free, busy: counts.busy, error: counts['entered-in-error'] };
  return (
    <div role="status" className="grid gap-2">
      <p className="text-sm text-[var(--muted-foreground)]">{t(isPartial ? 'grid.countsPartial' : 'grid.counts', values)}</p>
      {isPartial ? (
        <p data-testid="slots-truncated" className="rounded-control border border-[var(--warning)] p-2 text-sm">
          {t('grid.truncated')}
        </p>
      ) : null}
    </div>
  );
}

function SlotDays({ days }: { readonly days: ReadonlyArray<SlotDay<ScheduleSlot>> }): ReactNode {
  const locale = useUiStore((state) => state.locale);
  return (
    <div className="mt-3 grid gap-4">
      {days.map(({ day, slots: daySlots }) => (
        <section key={day} aria-label={formatDayHeading(day, locale, 'compact')}>
          <h3 className="serif text-base font-semibold">{formatDayHeading(day, locale, 'compact')}</h3>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {daySlots.map((slot) => (
              <SlotTile key={slot.id} slot={slot} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SlotResult({ items }: { readonly items: ReadonlyArray<ScheduleSlot> }): ReactNode {
  const days = useMemo(() => groupSlotsByDay(items), [items]);
  const counts = useMemo(() => countSlots(items), [items]);
  return (
    <>
      <SlotCountsLine counts={counts} isPartial={mayBeTruncated(items)} />
      <SlotDays days={days} />
    </>
  );
}

interface SlotFiltersProps {
  readonly query: SlotsQuery;
  readonly periodError: PeriodError | null;
  readonly onChange: (query: SlotsQuery) => void;
}

function PeriodFields({ query, periodError, onChange }: SlotFiltersProps): ReactNode {
  const t = useT('admin.slots');
  const error: string | undefined = periodError === null ? undefined : t(`grid.errors.${periodError}`);
  const dateProps = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? RANGE_ERROR_ID : undefined, wrapperClassName: 'w-44' } as const;
  return (
    <>
      <Field id="slots-from" label={t('grid.from')} error={error}>
        <DatePicker id="slots-from" {...dateProps} value={query.from} onChange={(from) => onChange({ ...query, from })} />
      </Field>
      <Field id="slots-to" label={t('grid.to')}>
        <DatePicker id="slots-to" {...dateProps} value={query.to} onChange={(to) => onChange({ ...query, to })} />
      </Field>
    </>
  );
}

function SlotFilters({ query, periodError, onChange }: SlotFiltersProps): ReactNode {
  const t = useT('admin.slots');
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <PeriodFields query={query} periodError={periodError} onChange={onChange} />
      <Field id="slots-status" label={t('grid.status')}>
        <Select id="slots-status" value={query.status} onChange={(event) => onChange({ ...query, status: event.target.value as SlotStatus | '' })}>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{t(`grid.statusFilter.${status === '' ? 'default' : status}`)}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function ScheduleSlotGrid({ schedule }: { readonly schedule: AdminSchedule }): ReactNode {
  const t = useT('admin.slots');
  const [query, setQuery] = useState<SlotsQuery>(() => ({ ...defaultGenerationRange(schedule), status: '' }));
  const periodError: PeriodError | null = validatePeriod(query);
  const slots = useScheduleSlots(schedule.id, query, periodError === null);
  return (
    <div>
      <SlotFilters query={query} periodError={periodError} onChange={setQuery} />
      <div className="mt-3">
        {periodError === null ? (
          <QueryState query={slots} isEmpty={(items) => items.length === 0} emptyTitle={t('grid.empty')} emptyDescription={t('grid.emptyHint')}>
            {(items) => <SlotResult items={items} />}
          </QueryState>
        ) : null}
      </div>
    </div>
  );
}
