'use client';

import { useMemo } from 'react';
import type { Slot } from '@/components/catalog/catalog-types';
import { useDoctorSlots } from '@/components/catalog/use-catalog';
import { clinicDateKey } from '@/lib/clinic-time';
import { nearestFreeSlots } from './slot-list';
import { slotWindow } from './slot-time';

const NEAREST_SLOT_COUNT = 3;

interface NearestSlots {
  readonly today: string;
  readonly slots: ReadonlyArray<Slot>;
  readonly isPending: boolean;
}

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
