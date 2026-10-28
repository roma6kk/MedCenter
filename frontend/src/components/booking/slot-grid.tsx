'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import type { Slot } from '@/components/catalog/catalog-types';
import { useT } from '@/lib/i18n/use-t';
import { isSelectable } from './slot-list';
import { SlotChip } from './slot-chip';
import { DAY_PARTS, dayPartOf, type DayPart } from './slot-time';
import { useRovingFocus } from './use-roving-focus';
import { useStableCallback } from './use-stable-callback';

interface SlotGridProps {
  /** The slots of the one chosen day. */
  readonly slots: ReadonlyArray<Slot>;
  readonly selectedSlotId: string | null;
  readonly takenSlotId: string | null;
  readonly showDuration: boolean;
  readonly onSelect: (slot: Slot) => void;
}

const PART_ICON: Readonly<Record<DayPart, LucideIcon>> = { morning: Sunrise, day: Sun, evening: Sunset };

/** The chip that holds the tab stop: the one last focused, else the chosen one, else the first that can be picked. */
function tabStopId(slots: ReadonlyArray<Slot>, focusedId: string | null, selectedSlotId: string | null): string | null {
  const pickable: ReadonlyArray<Slot> = slots.filter(isSelectable);
  const hasId = (id: string | null): id is string => id !== null && pickable.some((slot) => slot.id === id);
  if (hasId(focusedId)) return focusedId;
  if (hasId(selectedSlotId)) return selectedSlotId;
  return pickable[0]?.id ?? null;
}

interface PartProps extends Omit<SlotGridProps, 'slots'> {
  readonly part: DayPart;
  readonly slots: ReadonlyArray<Slot>;
  readonly tabStop: string | null;
  readonly onFocusSlot: (slotId: string) => void;
}

function PartSection({ part, slots, tabStop, selectedSlotId, takenSlotId, showDuration, onSelect, onFocusSlot }: PartProps): ReactNode {
  const t = useT('booking');
  const headingId: string = useId();
  const Icon: LucideIcon = PART_ICON[part];
  return (
    <section aria-labelledby={headingId} data-testid={`slot-part-${part}`}>
      <h4 id={headingId} className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon aria-hidden="true" size={16} />
        {t(`part.${part}`)}
      </h4>
      <ul className="mt-2 flex flex-wrap gap-2">
        {slots.map((slot) => (
          <li key={slot.id}>
            <SlotChip
              slot={slot}
              selected={slot.id === selectedSlotId}
              taken={slot.id === takenSlotId}
              showDuration={showDuration}
              tabStop={slot.id === tabStop}
              onSelect={onSelect}
              onFocusSlot={onFocusSlot}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The slots of one day as compact chips, grouped «Утро / День / Вечер» (clinic wall clock; an empty part is not drawn).
 * The arrow keys move between the chips, also across the parts (roving tabindex: the grid is a single stop of the Tab
 * order). The grouping is computed once per list of slots; a selection changes none of it.
 */
export function SlotGrid({ slots, onSelect, ...rest }: SlotGridProps): ReactNode {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const roving = useRovingFocus<HTMLDivElement>({ layout: 'grid' });
  const stableSelect = useStableCallback(onSelect);
  const onFocusSlot = useStableCallback((slotId: string): void => setFocusedId(slotId));
  const parts: ReadonlyArray<readonly [DayPart, ReadonlyArray<Slot>]> = useMemo(
    () => DAY_PARTS.map((part): readonly [DayPart, ReadonlyArray<Slot>] => [part, slots.filter((slot) => dayPartOf(slot.start) === part)]).filter(([, inPart]) => inPart.length > 0),
    [slots],
  );
  const tabStop: string | null = tabStopId(slots, focusedId, rest.selectedSlotId);
  return (
    <div ref={roving.ref} onKeyDown={roving.onKeyDown} className="flex flex-col gap-4">
      {parts.map(([part, inPart]) => (
        <PartSection key={part} part={part} slots={inPart} tabStop={tabStop} onSelect={stableSelect} onFocusSlot={onFocusSlot} {...rest} />
      ))}
    </div>
  );
}
