'use client';

import { useMemo, type ReactNode } from 'react';
import { useDoctorSlots } from '@/components/catalog/use-catalog';
import type { DoctorSlots, Slot } from '@/components/catalog/catalog-types';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { EmptyState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { SlotDayList } from './slot-day-list';
import { slotsForDuration, withTakenSlot } from './slot-list';
import { SlotPeriodControl } from './slot-period-control';
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
    <div role="status" aria-busy="true" data-testid="slot-skeleton" className="animate-pulse space-y-2">
      <span className="sr-only">{t('slotsLoading')}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true" className="h-11 rounded-[6px] bg-[var(--secondary)]" />
      ))}
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
}

function SlotResults({ data, selectedSlotId, onSelect, durationMin = null, takenSlot = null }: SlotResultsProps): ReactNode {
  const t = useT('booking');
  // Memoised so the list below keeps the same `slots` (and its day grouping) across the renders a selection causes.
  const visible: ReadonlyArray<Slot> = useMemo(() => withTakenSlot(slotsForDuration(data.items, durationMin), takenSlot), [data.items, durationMin, takenSlot]);
  if (visible.length === 0) return <SlotsEmpty hasOtherServices={data.items.length > 0} />;
  const freeCount: number = visible.filter((slot) => slot.status === 'free').length;
  return (
    <>
      <p role="status" className="sr-only">{t('slotsFound', { count: freeCount })}</p>
      {durationMin !== null ? <p className="mb-3 text-sm text-[var(--muted-foreground)]">{t('slotsFiltered', { minutes: durationMin })}</p> : null}
      <SlotDayList slots={visible} selectedSlotId={selectedSlotId} takenSlotId={takenSlot?.id ?? null} showDuration={durationMin === null} onSelect={onSelect} />
      {data.truncated === true ? <p className="mt-3 text-sm text-[var(--warning)]">{t('slotsTruncated')}</p> : null}
    </>
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
        <SlotResults data={query.data} selectedSlotId={selectedSlotId} onSelect={onSelect} durationMin={durationMin} takenSlot={takenSlot} />
      )}
    </div>
  );
}
