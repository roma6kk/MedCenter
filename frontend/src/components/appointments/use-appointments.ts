'use client';

import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { invalidateFor } from '@/lib/api/invalidation';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { showToast } from '@/lib/ui/toast';
import { cancelAppointment, fetchAppointment, fetchAppointments, type AppointmentListParams } from './appointment-api';
import type { AppointmentTab, AppointmentView } from './appointment-types';

export function isListOfTab(queryKey: QueryKey | undefined, tab: AppointmentTab): boolean {
  const params: unknown = queryKey?.[1];
  return typeof params === 'object' && params !== null && 'tab' in params && params.tab === tab;
}

export function useAppointments(params: AppointmentListParams): UseQueryResult<PaginatedResponse<AppointmentView>> {
  return useQuery({
    queryKey: queryKeys.appointments({ ...params }),
    queryFn: () => fetchAppointments(params),
    staleTime: STALE_TIME_MS.appointments,
    placeholderData: (previous, previousQuery) => (isListOfTab(previousQuery?.queryKey, params.tab) ? previous : undefined),
  });
}

export function useAppointment(appointmentId: string): UseQueryResult<AppointmentView> {
  return useQuery({
    queryKey: queryKeys.appointmentDetail(appointmentId),
    queryFn: () => fetchAppointment(appointmentId),
    staleTime: STALE_TIME_MS.appointments,
  });
}

export interface CancelInput {
  readonly appointmentId: string;
  readonly reason: string;
}

// The success is announced here, not by the caller: a caller that navigated away would never tell the user.
export function useCancelAppointment(): UseMutationResult<unknown, Error, CancelInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ appointmentId, reason }: CancelInput) => cancelAppointment(appointmentId, reason),
    onSuccess: async () => {
      await invalidateFor(client, 'cancel-appointment');
      showToast('success', 'appointments.cancelled');
    },
  });
}
