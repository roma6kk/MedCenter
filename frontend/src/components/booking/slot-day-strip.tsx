'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { formatDayHeading, formatWeekdayShort } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { useRovingFocus } from './use-roving-focus';

export interface StripDay {
  readonly day: string;
  /** Free slots of the day; the chip is closed at `0` (unless something else is shown for the day, see `hasSlots`). */
  readonly free: number;
  /** Anything to show for the day, e.g. only a slot another patient has just taken. */
  readonly hasSlots: boolean;
}

interface SlotDayStripProps {
  readonly days: ReadonlyArray<StripDay>;
  readonly selectedDay: string;
  readonly onSelect: (day: string) => void;
  /** Messages namespace with `dayStripLabel`, `dayChip`, `dayFree` and `dayNone`; the staff schedule has its own wording for the same strip. */
  readonly messages?: string;
}

function dayNumber(dateKey: string): string {
  return String(Number.parseInt(dateKey.slice(8, 10), 10));
}

/** Brings the chosen chip to the middle of a scrolling strip (a phone shows four or five of the fourteen days). */
function useScrollChosenIntoView(selectedDay: string, containerRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const container: HTMLElement | null = containerRef.current;
    const chip: HTMLElement | null = container === null ? null : container.querySelector<HTMLElement>('[aria-checked="true"]');
    if (container === null || chip === null || typeof container.scrollTo !== 'function') return;
    const reduced: boolean = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ left: Math.max(0, chip.offsetLeft - (container.clientWidth - chip.offsetWidth) / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [selectedDay, containerRef]);
}

/**
 * The days of the searched period as chips: weekday, date and the number of free slots. A day without any is closed
 * (`aria-disabled`, skipped by the arrows). A radio group: the arrows choose the neighbouring day at once, Tab leaves the
 * strip. On a phone the strip scrolls sideways, from `sm` it wraps.
 */
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
              'flex min-h-[4.25rem] w-[4.5rem] flex-none flex-col items-center justify-center rounded-control border px-1 py-1.5 text-center transition-[background-color,border-color,color,box-shadow] duration-fast ease-out',
              closed && 'cursor-not-allowed border-border-soft text-muted-foreground opacity-60',
              !closed && chosen && 'border-primary bg-primary-soft text-primary-soft-foreground ring-2 ring-primary',
              !closed && !chosen && 'border-border bg-card hover:border-primary hover:bg-primary-soft',
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
