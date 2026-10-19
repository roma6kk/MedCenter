'use client';

/**
 * Catalog hooks — TanStack Query over `catalog-api.ts` with the cache lifetimes of frontend-design-spec §5.1:
 * services and doctors 5 min (the server caches them in Redis), slots 15 s and a refetch on window focus.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import type { SlotWindow } from '@/components/booking/slot-time';
import { fetchDoctor, fetchDoctors, fetchDoctorSlots, fetchService, fetchServices } from './catalog-api';
import type { CatalogService, Doctor, DoctorPage, DoctorQuery, DoctorSlots, ServicePage } from './catalog-types';

export function useServices(): UseQueryResult<ServicePage> {
  return useQuery({ queryKey: queryKeys.services(), queryFn: fetchServices, staleTime: STALE_TIME_MS.catalog });
}

export function useService(serviceId: string | null): UseQueryResult<CatalogService> {
  return useQuery({
    queryKey: queryKeys.services({ id: serviceId }),
    queryFn: () => fetchService(serviceId ?? ''),
    enabled: serviceId !== null,
    staleTime: STALE_TIME_MS.catalog,
  });
}

export function useDoctors(query: DoctorQuery = {}): UseQueryResult<DoctorPage> {
  return useQuery({ queryKey: queryKeys.doctors({ ...query }), queryFn: () => fetchDoctors(query), staleTime: STALE_TIME_MS.catalog });
}

export function useDoctor(doctorId: string | null): UseQueryResult<Doctor> {
  return useQuery({
    queryKey: queryKeys.doctor(doctorId ?? ''),
    queryFn: () => fetchDoctor(doctorId ?? ''),
    enabled: doctorId !== null,
    staleTime: STALE_TIME_MS.catalog,
  });
}

/** Free slots of the doctor inside the window; stale after 15 s and refreshed when the tab regains focus (BR-001). */
export function useDoctorSlots(doctorId: string | null, window: SlotWindow): UseQueryResult<DoctorSlots> {
  return useQuery({
    queryKey: queryKeys.slots(doctorId ?? '', { from: window.from, to: window.to }),
    queryFn: () => fetchDoctorSlots(doctorId ?? '', window),
    enabled: doctorId !== null,
    staleTime: STALE_TIME_MS.slots,
    refetchOnWindowFocus: true,
  });
}
