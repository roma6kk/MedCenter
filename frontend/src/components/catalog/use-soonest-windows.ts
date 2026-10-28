'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { slotWindow } from '@/components/booking/slot-time';
import { nearestFreeSlots } from '@/components/booking/slot-list';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { clinicDateKey } from '@/lib/clinic-time';
import { fetchDoctorSlots } from './catalog-api';
import type { Doctor, Slot } from './catalog-types';

export interface SoonestWindow {
  readonly doctor: Doctor;
  readonly slot: Slot;
}

export interface SoonestWindows {
  /** Clinic's today, for wording the times («сегодня», «завтра»). */
  readonly today: string;
  /** The `count` doctors with the earliest free time, earliest first; one window per doctor. */
  readonly windows: ReadonlyArray<SoonestWindow>;
  readonly isPending: boolean;
}

/**
 * The nearest free window of each given doctor, the earliest `count` of them: what the landing hero offers instead of a picture.
 * It reads `GET /doctors/{id}/slots` for the same two-week window under the same query key as the doctor cards
 * (`useNearestSlots`), so the hero and the cards below share one answer per doctor.
 */
export function useSoonestWindows(doctors: ReadonlyArray<Doctor>, count: number): SoonestWindows {
  const today: string = clinicDateKey();
  const period = useMemo(() => slotWindow(today), [today]);
  const results = useQueries({
    queries: doctors.map((doctor) => ({
      queryKey: queryKeys.slots(doctor.id, { from: period.from, to: period.to }),
      queryFn: () => fetchDoctorSlots(doctor.id, period),
      staleTime: STALE_TIME_MS.slots,
      refetchOnWindowFocus: true,
    })),
  });
  const isPending: boolean = results.some((result) => result.isPending);
  const stamp: string = results.map((result) => result.dataUpdatedAt).join(',');
  const windows: ReadonlyArray<SoonestWindow> = useMemo(
    () =>
      doctors
        .flatMap((doctor, index): ReadonlyArray<SoonestWindow> => {
          const slot: Slot | undefined = nearestFreeSlots(results[index]?.data?.items ?? [], null, 1)[0];
          return slot === undefined ? [] : [{ doctor, slot }];
        })
        .sort((a, b) => Date.parse(a.slot.start) - Date.parse(b.slot.start))
        .slice(0, count),
    // `results` is a new array on every render; the update stamps say when its content really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doctors, count, stamp],
  );
  return { today, windows, isPending };
}
