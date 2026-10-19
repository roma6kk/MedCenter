'use client';

import { memo, useMemo, type ReactNode } from 'react';
import type { Slot } from '@/components/catalog/catalog-types';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { isSelectable } from './slot-list';
import { formatDayHeading, formatSlotTime, groupSlotsByDay, slotDurationMin, type SlotDay } from './slot-time';
import { useStableCallback } from './use-stable-callback';

interface SlotDayListProps {
  readonly slots: ReadonlyArray<Slot>;
  readonly selectedSlotId: string | null;
  /** The slot the server has just refused: drawn as taken, with a destructive border. */
  readonly takenSlotId: string | null;
  readonly showDuration: boolean;
  readonly onSelect: (slot: Slot) => void;
}

interface SlotTileProps {
  readonly slot: Slot;
  readonly selected: boolean;
  readonly taken: boolean;
  readonly showDuration: boolean;
  readonly onSelect: (slot: Slot) => void;
}

function tileClass(selected: boolean, taken: boolean, selectable: boolean): string {
  const base = 'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-left';
  if (taken) return `${base} border-[1.5px] border-[var(--destructive)] text-[var(--muted-foreground)] line-through`;
  if (!selectable) return `${base} border-[var(--border)] text-[var(--muted-foreground)] line-through`;
  if (selected) return `${base} border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]`;
  return `${base} border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)]`;
}

/**
 * One slot. Memoised: a click changes `selected` of two tiles only, so the other ~300 do not render again
 * (their props are primitives, the slot objects keep their identity and `onSelect` is stable).
 */
const SlotTile = memo(function SlotTile({ slot, selected, taken, showDuration, onSelect }: SlotTileProps): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const selectable: boolean = isSelectable(slot);
  const isSelected: boolean = selectable && selected;
  return (
    <button
      type="button"
      aria-pressed={selectable ? isSelected : undefined}
      aria-disabled={selectable ? undefined : true}
      data-testid={`slot-${slot.id}`}
      data-state={taken ? 'taken' : slot.status}
      onClick={() => {
        if (selectable) onSelect(slot);
      }}
      className={tileClass(isSelected, taken, selectable)}
    >
      <span className="mono text-sm">{formatSlotTime(slot.start, locale)}</span>
      {selectable && showDuration ? <span className="text-xs">{t('slotMinutes', { minutes: slotDurationMin(slot) })}</span> : null}
      {taken ? <span className="text-xs">{t('slotTaken')}</span> : null}
      {!selectable && !taken ? <StampBadge status={slot.status} /> : null}
    </button>
  );
});

function SlotDaySection({ day, selectedSlotId, takenSlotId, showDuration, onSelect }: { readonly day: SlotDay } & Omit<SlotDayListProps, 'slots'>): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const heading: string = formatDayHeading(day.day, locale);
  return (
    <section aria-label={t('slotsFor', { day: heading })} data-testid={`slot-day-${day.day}`}>
      <h3 className="serif text-lg font-semibold">{heading}</h3>
      <ul className="mt-2 grid grid-cols-1 gap-2 min-[480px]:grid-cols-3 md:grid-cols-5">
        {day.slots.map((slot) => (
          <li key={slot.id}>
            <SlotTile slot={slot} selected={slot.id === selectedSlotId} taken={slot.id === takenSlotId} showDuration={showDuration} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Slot tiles grouped by clinic day: Minsk wall-clock time in mono type; taken and withdrawn slots are shown but inert.
 * The grouping is computed once per list of slots, not on every render (a selection changes none of them).
 */
export function SlotDayList({ slots, onSelect, ...rest }: SlotDayListProps): ReactNode {
  const days: ReadonlyArray<SlotDay> = useMemo(() => groupSlotsByDay(slots), [slots]);
  const stableSelect = useStableCallback(onSelect);
  return (
    <div className="space-y-5">
      {days.map((day) => (
        <SlotDaySection key={day.day} day={day} onSelect={stableSelect} {...rest} />
      ))}
    </div>
  );
}
