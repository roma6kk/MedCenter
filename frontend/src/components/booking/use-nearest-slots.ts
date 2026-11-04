'use client';

import { useMemo } from 'react';
import type { Slot } from '@/components/catalog/catalog-types';
import { useDoctorSlots } from '@/components/catalog/use-catalog';
import { clinicDateKey } from '@/lib/clinic-time';
import { nearestFreeSlots } from './slot-list';
import { slotWindow } from './slot-time';

export const NEAREST_SLOT_COUNT = 3;

export interface NearestSlots {
  readonly today: string;
  readonly slots: ReadonlyArray<Slot>;
  readonly isPending: boolean;
}

/**
 * The few earliest free slots of a doctor, for the doctor card. It asks for the same two-week window the slot step opens
 * with, so both share one cached answer: choosing the doctor does not search again.
 */
export function useNearestSlots(doctorId: string, durationMin: number | null, serviceId: string | null = null): NearestSlots {
  const today: string = clinicDateKey();
  const window = useMemo(() => slotWindow(today), [today]);
  const query = useDoctorSlots(doctorId, window);
  const slots: ReadonlyArray<Slot> = useMemo(
    () => (query.data === undefined ? [] : nearestFreeSlots(query.data.items, durationMin, NEAREST_SLOT_COUNT, serviceId)),
    [query.data, durationMin, serviceId],
  );
  return { today, slots, isPending: query.isPending };
}
