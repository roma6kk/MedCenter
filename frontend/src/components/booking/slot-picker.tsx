'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useDoctorSlots } from '@/components/catalog/use-catalog';
import type { DoctorSlots, Slot } from '@/components/catalog/catalog-types';
import { LoadingNote } from '@/components/feedback/loading-note';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { EmptyState } from '@/components/feedback/states';
import { Skeleton } from '@/components/ui/skeleton';
import { clinicDayOf, formatDayHeading, groupSlotsByDay } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { SlotDayStrip, type StripDay } from './slot-day-strip';
import { SlotGrid } from './slot-grid';
import { isSelectable, slotsForDuration, withTakenSlot } from './slot-list';
import { SlotPeriodControl } from './slot-period-control';
import { windowDays, type SlotWindow } from './slot-time';
import { useSlotWindow } from './use-slot-window';

export interface SlotPickerProps {
  readonly doctorId: string;
  readonly selectedSlotId: string | null;
  readonly onSelect: (slot: Slot) => void;
  /** Length of the chosen service: only slots of that length are offered (the slot search knows no service). */
  readonly durationMin?: number | null;
  /** The slot the server has just refused (SLOT_CONFLICT): shown as taken. */
  readonly takenSlot?: Slot | null;
  /** First day of the picked period when it is known (a restored draft), else today. */
  readonly initialFrom?: string;
}

function SlotSkeleton(): ReactNode {
  const t = useT('booking');
  return (
    <div role="status" aria-busy="true" data-testid="slot-skeleton" className="space-y-2">
      <span className="sr-only">{t('slotsLoading')}</span>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-11 rounded-control" />
      ))}
      <LoadingNote />
    </div>
  );
}

function SlotsEmpty({ hasOtherServices }: { readonly hasOtherServices: boolean }): ReactNode {
  const t = useT('booking');
  return hasOtherServices ? (
    <EmptyState title={t('noSlotsForService')} description={t('noSlotsForServiceHint')} />
  ) : (
    <EmptyState title={t('noSlots')} description={t('noSlotsHint')} />
  );
}

interface SlotResultsProps extends Pick<SlotPickerProps, 'selectedSlotId' | 'onSelect' | 'durationMin' | 'takenSlot'> {
  readonly data: DoctorSlots;
  /** The period that was asked for: the day strip lists its days (the answer's own echo of it is not relied on). */
  readonly period: SlotWindow;
}

function dayOfSlot(slots: ReadonlyArray<Slot>, slotId: string | null): string | null {
  const found: Slot | undefined = slotId === null ? undefined : slots.find((slot) => slot.id === slotId);
  return found === undefined ? null : clinicDayOf(found.start);
}

/** The day opened first: the one with the chosen slot, else the one with the refused slot, else the first with free time. */
function defaultDay(days: ReadonlyArray<StripDay>, slots: ReadonlyArray<Slot>, selectedSlotId: string | null, takenSlotId: string | null): string {
  const withSlots: ReadonlyArray<StripDay> = days.filter((day) => day.hasSlots);
  const wanted: ReadonlyArray<string | null> = [dayOfSlot(slots, selectedSlotId), dayOfSlot(slots, takenSlotId)];
  const preferred: string | undefined = wanted.find((day) => day !== null && withSlots.some((item) => item.day === day)) ?? undefined;
  return preferred ?? withSlots.find((day) => day.free > 0)?.day ?? withSlots[0]?.day ?? '';
}

function SlotResults({ data, period, selectedSlotId, onSelect, durationMin = null, takenSlot = null }: SlotResultsProps): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  // Memoised so the grid below keeps the same `slots` (and its grouping) across the renders a selection causes.
  const visible: ReadonlyArray<Slot> = useMemo(() => withTakenSlot(slotsForDuration(data.items, durationMin), takenSlot), [data.items, durationMin, takenSlot]);
  const byDay: ReadonlyMap<string, ReadonlyArray<Slot>> = useMemo(() => new Map(groupSlotsByDay(visible).map(({ day, slots }) => [day, slots])), [visible]);
  const { from, to } = period;
  const days: ReadonlyArray<StripDay> = useMemo(
    () => windowDays({ from, to }).map((day) => ({ day, free: (byDay.get(day) ?? []).filter(isSelectable).length, hasSlots: byDay.has(day) })),
    [from, to, byDay],
  );
  if (visible.length === 0) return <SlotsEmpty hasOtherServices={data.items.length > 0} />;
  const fallback: string = defaultDay(days, visible, selectedSlotId, takenSlot?.id ?? null);
  const day: string = chosenDay !== null && byDay.has(chosenDay) ? chosenDay : fallback;
  const daySlots: ReadonlyArray<Slot> = byDay.get(day) ?? [];
  const freeCount: number = visible.filter(isSelectable).length;
  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">{t('slotsFound', { count: freeCount })}</p>
      {durationMin !== null ? <p className="text-sm text-muted-foreground">{t('slotsFiltered', { minutes: durationMin })}</p> : null}
      <SlotDayStrip days={days} selectedDay={day} onSelect={setChosenDay} />
      <section aria-label={t('slotsFor', { day: formatDayHeading(day, locale) })} data-testid={`slot-day-${day}`} className="flex flex-col gap-3 animate-step-in" key={day}>
        <h3 className="text-base font-semibold">{formatDayHeading(day, locale)}</h3>
        <SlotGrid slots={daySlots} selectedSlotId={selectedSlotId} takenSlotId={takenSlot?.id ?? null} showDuration={durationMin === null} onSelect={onSelect} />
      </section>
      {data.truncated === true ? <p className="text-sm text-warning">{t('slotsTruncated')}</p> : null}
    </div>
  );
}

/**
 * Free slots of one doctor for a period (`GET /doctors/{id}/slots?from=&to=`, API 5.2.8): two weeks from today by
 * default, movable by period or by date. Slots go stale in 15 s and refresh when the tab regains focus (BR-001).
 */
export function SlotPicker({ doctorId, selectedSlotId, onSelect, durationMin = null, takenSlot = null, initialFrom }: SlotPickerProps): ReactNode {
  const windowState = useSlotWindow(initialFrom);
  const query = useDoctorSlots(doctorId, windowState.window);
  return (
    <div className="space-y-4">
      <SlotPeriodControl state={windowState} />
      {query.data === undefined ? (
        <QueryFailure query={query} embedded pending={<SlotSkeleton />} />
      ) : (
        <SlotResults key={windowState.window.from} data={query.data} period={windowState.window} selectedSlotId={selectedSlotId} onSelect={onSelect} durationMin={durationMin} takenSlot={takenSlot} />
      )}
    </div>
  );
}
