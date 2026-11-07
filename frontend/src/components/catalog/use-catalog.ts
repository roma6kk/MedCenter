'use client';

import { useQueries, useQuery, type Query, type QueryKey, type UseQueryResult } from '@tanstack/react-query';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import type { SlotWindow } from '@/components/booking/slot-time';
import { fetchDoctor, fetchDoctors, fetchDoctorSlots, fetchService, fetchServices } from './catalog-api';
import type { CatalogService, Doctor, DoctorPage, DoctorQuery, DoctorSlots, ServicePage } from './catalog-types';

function catalogStaleTime<TList extends { readonly items: ReadonlyArray<unknown> }>(query: Query<TList, Error, TList, QueryKey>): number {
  return query.state.data?.items.length === 0 ? 0 : STALE_TIME_MS.catalog;
}

export function useServices(): UseQueryResult<ServicePage> {
  return useQuery({ queryKey: queryKeys.services(), queryFn: fetchServices, staleTime: catalogStaleTime });
}

export function useService(serviceId: string | null): UseQueryResult<CatalogService> {
  return useQuery({
    queryKey: queryKeys.services({ id: serviceId }),
    queryFn: () => fetchService(serviceId ?? ''),
    enabled: serviceId !== null,
    staleTime: STALE_TIME_MS.catalog,
  });
}

export function useDoctors(query: DoctorQuery = {}, enabled: boolean = true): UseQueryResult<DoctorPage> {
  return useQuery({ queryKey: queryKeys.doctors({ ...query }), queryFn: () => fetchDoctors(query), staleTime: catalogStaleTime, enabled });
}

export function useDoctor(doctorId: string | null): UseQueryResult<Doctor> {
  return useQuery({
    queryKey: queryKeys.doctor(doctorId ?? ''),
    queryFn: () => fetchDoctor(doctorId ?? ''),
    enabled: doctorId !== null,
    staleTime: STALE_TIME_MS.catalog,
  });
}

export function useDoctorSlots(doctorId: string | null, window: SlotWindow): UseQueryResult<DoctorSlots> {
  return useQuery({
    queryKey: queryKeys.slots(doctorId ?? '', { from: window.from, to: window.to }),
    queryFn: () => fetchDoctorSlots(doctorId ?? '', window),
    enabled: doctorId !== null,
    staleTime: STALE_TIME_MS.slots,
    refetchOnWindowFocus: true,
  });
}

interface DoctorsByService {
  readonly results: ReadonlyArray<UseQueryResult<DoctorPage>>;
  readonly stamp: string;
  readonly isPending: boolean;
}

export function useDoctorsByService(services: ReadonlyArray<CatalogService>): DoctorsByService {
  const results = useQueries({
    queries: services.map((service) => ({
      queryKey: queryKeys.doctors({ serviceId: service.id }),
      queryFn: () => fetchDoctors({ serviceId: service.id }),
      staleTime: catalogStaleTime,
    })),
  });
  return { results, stamp: results.map((result) => result.dataUpdatedAt).join(','), isPending: results.some((result) => result.isPending) };
}
