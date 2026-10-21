'use client';

import { useState } from 'react';
import { clinicDateKey, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, clampToHorizon, slotWindow, type SlotWindow } from './slot-time';

export interface SlotWindowState {
  readonly window: SlotWindow;
  readonly today: string;
  /** The last day the picker may start at (`MAX_LOOKAHEAD_DAYS` ahead): the "jump to date" field stops there too. */
  readonly lastDay: string;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly goBack: () => void;
  readonly goForward: () => void;
  /** Starts the window at a typed day; garbage is ignored, past and too distant days are clamped. */
  readonly jumpTo: (day: string) => void;
}

/**
 * The period the slot picker looks at: `SLOT_WINDOW_DAYS` days from `from`, never starting before today (clinic calendar)
 * and never beyond the API's look-ahead (a `from` over 366 days ahead is a 400).
 */
export function useSlotWindow(initialFrom?: string): SlotWindowState {
  const today: string = clinicDateKey();
  const [from, setFrom] = useState<string>(() => clampToHorizon(initialFrom, today));
  const current: string = clampToHorizon(from, today);
  const lastDay: string = shiftDateKey(today, MAX_LOOKAHEAD_DAYS);
  return {
    window: slotWindow(current),
    today,
    lastDay,
    canGoBack: current > today,
    canGoForward: current < lastDay,
    goBack: () => setFrom(clampToHorizon(shiftDateKey(current, -SLOT_WINDOW_DAYS), today)),
    goForward: () => setFrom(clampToHorizon(shiftDateKey(current, SLOT_WINDOW_DAYS), today)),
    jumpTo: (day) => {
      if (isDateKey(day)) setFrom(clampToHorizon(day, today));
    },
  };
}
