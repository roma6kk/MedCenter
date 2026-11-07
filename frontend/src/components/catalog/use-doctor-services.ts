'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { fetchDoctors } from './catalog-api';
import type { CatalogService } from './catalog-types';
import { catalogStaleTime, useServices } from './use-catalog';

export interface DoctorServices {
  readonly services: ReadonlyArray<CatalogService>;
  readonly isPending: boolean;
}

export function useDoctorServices(doctorId: string): DoctorServices {
  const catalog = useServices();
  const all: ReadonlyArray<CatalogService> = useMemo(() => (catalog.data?.items ?? []).filter((service) => service.isActive), [catalog.data]);
  const results = useQueries({
    queries: all.map((service) => ({
      queryKey: queryKeys.doctors({ serviceId: service.id }),
      queryFn: () => fetchDoctors({ serviceId: service.id }),
      staleTime: catalogStaleTime,
    })),
  });
  const stamp: string = results.map((result) => result.dataUpdatedAt).join(',');
  const services: ReadonlyArray<CatalogService> = useMemo(
    () => all.filter((_, index) => results[index]?.data?.items.some((doctor) => doctor.id === doctorId) === true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, doctorId, stamp],
  );
  return { services, isPending: catalog.isPending || results.some((result) => result.isPending) };
}
