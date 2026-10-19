'use client';

import { useState } from 'react';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, clampToHorizon, isIsoDay, shiftDay, slotWindow, todayInClinic, type SlotWindow } from './slot-time';

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
  const today: string = todayInClinic();
  const [from, setFrom] = useState<string>(() => clampToHorizon(initialFrom, today));
  const current: string = clampToHorizon(from, today);
  const lastDay: string = shiftDay(today, MAX_LOOKAHEAD_DAYS);
  return {
    window: slotWindow(current),
    today,
    lastDay,
    canGoBack: current > today,
    canGoForward: current < lastDay,
    goBack: () => setFrom(clampToHorizon(shiftDay(current, -SLOT_WINDOW_DAYS), today)),
    goForward: () => setFrom(clampToHorizon(shiftDay(current, SLOT_WINDOW_DAYS), today)),
    jumpTo: (day) => {
      if (isIsoDay(day)) setFrom(clampToHorizon(day, today));
    },
  };
}
