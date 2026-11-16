'use client';

import { specialtiesOf, type SpecialtyOption } from '@/components/catalog/doctor-directory';
import { useDoctors } from '@/components/catalog/use-catalog';

const ALL_PAGE_SIZE = 100;

// The specialties of the doctors the clinic already has: the same list as the public catalog filter.
export function useSpecialtyOptions(): ReadonlyArray<SpecialtyOption> {
  const doctors = useDoctors({ pageSize: ALL_PAGE_SIZE });
  return specialtiesOf(doctors.data?.items ?? []);
}
