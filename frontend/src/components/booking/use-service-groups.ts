'use client';

import { useMemo } from 'react';
import type { CatalogService } from '@/components/catalog/catalog-types';
import { useDoctorsByService } from '@/components/catalog/use-catalog';
import { groupServices, specialtyOfDoctors, type ServiceGroup } from './service-groups';

interface ServiceGroups {
  readonly groups: ReadonlyArray<ServiceGroup>;
  readonly isPending: boolean;
}

export function useServiceGroups(services: ReadonlyArray<CatalogService>): ServiceGroups {
  const { results, stamp, isPending } = useDoctorsByService(services);
  const groups: ReadonlyArray<ServiceGroup> = useMemo(
    () => groupServices(services, (serviceId) => specialtyOfDoctors(results[services.findIndex((service) => service.id === serviceId)]?.data?.items)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, stamp],
  );
  return { groups, isPending };
}
