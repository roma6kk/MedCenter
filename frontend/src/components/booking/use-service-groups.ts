'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchDoctors } from '@/components/catalog/catalog-api';
import type { CatalogService } from '@/components/catalog/catalog-types';
import { catalogStaleTime } from '@/components/catalog/use-catalog';
import { queryKeys } from '@/lib/api/query-keys';
import { groupServices, specialtyOfDoctors, type ServiceGroup } from './service-groups';

export interface ServiceGroups {
  readonly groups: ReadonlyArray<ServiceGroup>;
  readonly isPending: boolean;
}

export function useServiceGroups(services: ReadonlyArray<CatalogService>): ServiceGroups {
  const results = useQueries({
    queries: services.map((service) => ({
      queryKey: queryKeys.doctors({ serviceId: service.id }),
      queryFn: () => fetchDoctors({ serviceId: service.id }),
      staleTime: catalogStaleTime,
    })),
  });
  const isPending: boolean = results.some((result) => result.isPending);
  const doctorsKey: string = results.map((result) => result.dataUpdatedAt).join(',');
  const groups: ReadonlyArray<ServiceGroup> = useMemo(
    () => groupServices(services, (serviceId) => specialtyOfDoctors(results[services.findIndex((service) => service.id === serviceId)]?.data?.items)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, doctorsKey],
  );
  return { groups, isPending };
}
