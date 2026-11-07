'use client';

import { memo, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Slot } from '@/components/catalog/catalog-types';
import { formatClinicTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { isSelectable } from './slot-list';
import { slotDurationMin } from './slot-time';

interface SlotChipProps {
  readonly slot: Slot;
  readonly selected: boolean;
  readonly taken: boolean;
  readonly showDuration: boolean;
  readonly tabStop: boolean;
  readonly onSelect: (slot: Slot) => void;
  readonly onFocusSlot: (slotId: string) => void;
}

const BASE = 'inline-flex min-h-[44px] w-[4.75rem] flex-col items-center justify-center rounded-control border px-1.5 py-1 text-center transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out';

function chipClass(selected: boolean, taken: boolean, selectable: boolean): string {
  if (taken) return cn(BASE, 'border-[1.5px] border-destructive text-muted-foreground line-through');
  if (!selectable) return cn(BASE, 'border-border text-muted-foreground line-through');
  if (selected) return cn(BASE, 'border-primary bg-primary text-primary-foreground shadow-elev-1 active:scale-[0.97]');
  return cn(BASE, 'border-border bg-card hover:border-primary hover:bg-primary-soft active:scale-[0.97]');
}

export const SlotChip = memo(function SlotChip({ slot, selected, taken, showDuration, tabStop, onSelect, onFocusSlot }: SlotChipProps): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const selectable: boolean = isSelectable(slot);
  const isSelected: boolean = selectable && selected;
  return (
    <button
      type="button"
      data-roving=""
      tabIndex={tabStop ? 0 : -1}
      aria-pressed={selectable ? isSelected : undefined}
      aria-disabled={selectable ? undefined : true}
      data-testid={`slot-${slot.id}`}
      data-state={taken ? 'taken' : slot.status}
      onFocus={() => onFocusSlot(slot.id)}
      onClick={() => {
        if (selectable) onSelect(slot);
      }}
      className={chipClass(isSelected, taken, selectable)}
    >
      <span className="inline-flex items-center gap-1 tabular-nums text-sm font-semibold">
        {formatClinicTime(slot.start, locale)}
        {isSelected ? <Check aria-hidden="true" size={14} strokeWidth={3} className="flex-none" /> : null}
      </span>
      {selectable && showDuration ? <span className="tabular-nums text-xs">{t('slotMinutes', { minutes: slotDurationMin(slot) })}</span> : null}
      {taken ? <span className="sr-only">{t('slotTaken')}</span> : null}
    </button>
  );
});
