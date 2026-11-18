'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import { adminAppointmentParams, type AdminAppointmentFilter } from './admin-appointment-filter';

export function useAdminAppointments(filter: AdminAppointmentFilter, page: number): UseQueryResult<PaginatedResponse<AppointmentView>, Error> {
  const params = adminAppointmentParams(filter, page);
  return useQuery({
    queryKey: queryKeys.adminAppointments(params),
    queryFn: () => apiFetch<PaginatedResponse<AppointmentView>>(withQuery('/api/v1/admin/appointments', params)),
    placeholderData: keepPreviousData,
  });
}
