'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { formatDayHeading, formatWeekdayShort } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { motionSafeScrollBehavior } from '@/lib/ui/motion';
import { useUiStore } from '@/store/use-ui-store';
import { useRovingFocus } from './use-roving-focus';

export interface StripDay {
  readonly day: string;
  readonly free: number;
  readonly hasSlots: boolean;
}

interface SlotDayStripProps {
  readonly days: ReadonlyArray<StripDay>;
  readonly selectedDay: string;
  readonly onSelect: (day: string) => void;
  readonly messages?: string;
}

function dayNumber(dateKey: string): string {
  return String(Number.parseInt(dateKey.slice(8, 10), 10));
}

function useScrollChosenIntoView(selectedDay: string, containerRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const container: HTMLElement | null = containerRef.current;
    const chip: HTMLElement | null = container === null ? null : container.querySelector<HTMLElement>('[aria-checked="true"]');
    if (container === null || chip === null || typeof container.scrollTo !== 'function') return;
    container.scrollTo({ left: Math.max(0, chip.offsetLeft - (container.clientWidth - chip.offsetWidth) / 2), behavior: motionSafeScrollBehavior() });
  }, [selectedDay, containerRef]);
}

export function SlotDayStrip({ days, selectedDay, onSelect, messages = 'booking' }: SlotDayStripProps): ReactNode {
  const t = useT(messages);
  const locale = useUiStore((state) => state.locale);
  const roving = useRovingFocus<HTMLDivElement>({ layout: 'row', selectOnMove: true });
  useScrollChosenIntoView(selectedDay, roving.ref);
  return (
    <div
      ref={roving.ref}
      role="radiogroup"
      aria-label={t('dayStripLabel')}
      onKeyDown={roving.onKeyDown}
      data-testid="slot-day-strip"
      className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0"
    >
      {days.map(({ day, free, hasSlots }) => {
        const closed: boolean = !hasSlots;
        const chosen: boolean = day === selectedDay;
        const label: string = t('dayChip', { day: formatDayHeading(day, locale), count: free });
        return (
          <button
            key={day}
            type="button"
            role="radio"
            data-roving=""
            aria-checked={chosen}
            aria-disabled={closed ? true : undefined}
            aria-label={label}
            tabIndex={chosen ? 0 : -1}
            data-testid={`slot-day-chip-${day}`}
            title={label}
            onClick={() => {
              if (!closed) onSelect(day);
            }}
            className={cn(
              'flex min-h-[4.25rem] w-[4.5rem] flex-none flex-col items-center justify-center rounded-control border px-1 py-1.5 text-center transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
              closed && 'cursor-not-allowed border-border-soft text-muted-foreground opacity-60',
              !closed && chosen && 'border-primary bg-primary-soft text-primary-soft-foreground ring-2 ring-primary active:scale-[0.97]',
              !closed && !chosen && 'border-border bg-card hover:border-primary hover:bg-primary-soft active:scale-[0.97]',
            )}
          >
            <span aria-hidden="true" className="text-xs font-medium uppercase">{formatWeekdayShort(day, locale)}</span>
            <span aria-hidden="true" className="tabular-nums text-lg font-bold leading-tight">{dayNumber(day)}</span>
            <span aria-hidden="true" className="tabular-nums text-xs">{free === 0 ? t('dayNone') : t('dayFree', { count: free })}</span>
          </button>
        );
      })}
    </div>
  );
}
