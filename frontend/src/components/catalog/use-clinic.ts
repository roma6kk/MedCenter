'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { useT } from '@/lib/i18n/use-t';
import { CLINIC_CONTACTS, CLINIC_LEGAL } from './home-content';

export interface ClinicDetails {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly address: string;
  readonly hours: string;
}

export function useClinicQuery(): UseQueryResult<ClinicDetails, Error> {
  return useQuery({ queryKey: queryKeys.clinic, queryFn: () => apiFetch<ClinicDetails>('/api/v1/clinic'), staleTime: STALE_TIME_MS.catalog });
}

/** The public pages must never break: until the answer arrives (or when it fails) the demo constants are shown. */
export function useClinic(): ClinicDetails {
  const t = useT('home');
  const { data } = useClinicQuery();
  return data ?? { name: CLINIC_LEGAL.name, phone: CLINIC_CONTACTS.phone, email: CLINIC_CONTACTS.email, address: t('contactAddressValue'), hours: t('contactHoursValue') };
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[\s\-()]/g, '')}`;
}
