'use client';

import { useMemo } from 'react';
import type { CatalogService } from './catalog-types';
import { useDoctorsByService, useServices } from './use-catalog';

interface DoctorServices {
  readonly services: ReadonlyArray<CatalogService>;
  readonly isPending: boolean;
}

export function useDoctorServices(doctorId: string): DoctorServices {
  const catalog = useServices();
  const all: ReadonlyArray<CatalogService> = useMemo(() => (catalog.data?.items ?? []).filter((service) => service.isActive), [catalog.data]);
  const { results, stamp, isPending } = useDoctorsByService(all);
  const services: ReadonlyArray<CatalogService> = useMemo(
    () => all.filter((_, index) => results[index]?.data?.items.some((doctor) => doctor.id === doctorId) === true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, doctorId, stamp],
  );
  return { services, isPending: catalog.isPending || isPending };
}
