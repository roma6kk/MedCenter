'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { fetchDoctors } from './catalog-api';
import type { CatalogService } from './catalog-types';
import { catalogStaleTime, useServices } from './use-catalog';

export interface DoctorServices {
  /** The active services this doctor gives, in the catalogue's order. */
  readonly services: ReadonlyArray<CatalogService>;
  /** Some service has not yet said who gives it: the list may still grow. */
  readonly isPending: boolean;
}

/**
 * The API has no «services of a doctor», only «doctors of a service» (`GET /doctors?serviceId=`), so the doctor's services
 * are those whose doctor list contains him. Each read uses the key the booking wizard's doctor step uses, so the profile
 * and the wizard share the answers. A failed read only leaves its service out.
 */
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
    // `results` is a new array on every render; the update stamps say when its content really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, doctorId, stamp],
  );
  return { services, isPending: catalog.isPending || results.some((result) => result.isPending) };
}
