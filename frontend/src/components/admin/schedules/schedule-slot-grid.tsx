'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { StampBadge, type SlotStatus } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicTime, formatDayHeading, groupSlotsByDay, type SlotDay } from '@/lib/clinic-time';
import type { AdminSchedule, ScheduleSlot } from './schedule-types';
import { CONTROL_CLASS } from '../shared/admin-styles';
import { Field } from '../shared/form-field';
import { QueryState } from '../shared/query-state';
import { defaultGenerationRange, validatePeriod, type PeriodError } from './generation-range';
import { countSlots, mayBeTruncated, type SlotCounts } from './slot-grouping';
import { useScheduleSlots, type SlotsQuery } from './use-admin-schedules';

const STATUS_FILTERS: ReadonlyArray<SlotStatus | ''> = ['', 'free', 'busy', 'entered-in-error'];
/** The id the `Field` of «С» gives its error text; «По» is described by the same text. */
const RANGE_ERROR_ID = 'slots-from-error';

function SlotTile({ slot }: { readonly slot: ScheduleSlot }): ReactNode {
  return (
    <li data-testid={`slot-${slot.status}`} className="flex items-center justify-between gap-2 rounded-control border border-[var(--border)] px-2 py-1 text-sm">
      <span className="mono">
        {formatClinicTime(slot.start)}–{formatClinicTime(slot.end)}
      </span>
      <StampBadge status={slot.status} />
    </li>
  );
}

/** The totals, and — when the answer is as long as the server's page — the warning that they may be incomplete. */
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
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

/** «С» and «По»: one period error describes both dates (it is the pair that is wrong, not one of them). */
function PeriodFields({ query, periodError, onChange }: SlotFiltersProps): ReactNode {
  const t = useT('admin.slots');
  const error: string | undefined = periodError === null ? undefined : t(`grid.errors.${periodError}`);
  const dateProps = { type: 'date', 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? RANGE_ERROR_ID : undefined, className: CONTROL_CLASS } as const;
  return (
    <>
      <Field id="slots-from" label={t('grid.from')} error={error}>
        <input id="slots-from" {...dateProps} value={query.from} onChange={(event) => onChange({ ...query, from: event.target.value })} />
      </Field>
      <Field id="slots-to" label={t('grid.to')}>
        <input id="slots-to" {...dateProps} value={query.to} onChange={(event) => onChange({ ...query, to: event.target.value })} />
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
        <select id="slots-status" value={query.status} onChange={(event) => onChange({ ...query, status: event.target.value as SlotStatus | '' })} className={CONTROL_CLASS}>
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{t(`grid.statusFilter.${status === '' ? 'default' : status}`)}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/**
 * The slots of one schedule by day, with free / busy / entered-in-error told apart (api-designer-spec §5.2.6). It opens on the
 * next two weeks of the planning horizon, so a schedule that starts later is not shown as empty. A period that cannot be sent
 * (cleared or reversed dates, over 90 days) is explained instead of asked for.
 */
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
