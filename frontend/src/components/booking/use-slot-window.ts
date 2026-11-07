'use client';

import { useState } from 'react';
import { clinicDateKey, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { MAX_LOOKAHEAD_DAYS, SLOT_WINDOW_DAYS, clampToHorizon, slotWindow, type SlotWindow } from './slot-time';

export interface SlotWindowState {
  readonly window: SlotWindow;
  readonly today: string;
  readonly lastDay: string;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly goBack: () => void;
  readonly goForward: () => void;
  readonly jumpTo: (day: string) => void;
}

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
