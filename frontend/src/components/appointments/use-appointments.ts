'use client';

/**
 * Appointment hooks of the patient cabinet. Reads are cached for 30 s (§5.1); a cancellation refreshes the lists, the
 * detail, the doctor's journal, the slots and the unread counter through the shared invalidation table.
 */
import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { invalidateFor } from '@/lib/api/invalidation';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { showToast } from '@/lib/ui/toast';
import { cancelAppointment, fetchAppointment, fetchAppointments, type AppointmentListParams } from './appointment-api';
import type { AppointmentTab, AppointmentView } from './appointment-types';

/** Whether a list query was made for `tab` (its params are the second element of the key, see `queryKeys.appointments`). */
export function isListOfTab(queryKey: QueryKey | undefined, tab: AppointmentTab): boolean {
  const params: unknown = queryKey?.[1];
  return typeof params === 'object' && params !== null && 'tab' in params && params.tab === tab;
}

export function useAppointments(params: AppointmentListParams): UseQueryResult<PaginatedResponse<AppointmentView>> {
  return useQuery({
    queryKey: queryKeys.appointments({ ...params }),
    queryFn: () => fetchAppointments(params),
    staleTime: STALE_TIME_MS.appointments,
    // Paging keeps the previous page on screen instead of flashing a skeleton between pages. Another tab is another list:
    // showing its answer under the new tab would lie (a false "no appointments" for a patient who only has history).
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

/**
 * Resolves only after the refreshed lists are back, so a caller that closes a dialog on success shows the new status. The
 * confirmation is announced from here, not from the caller: a caller that went away meanwhile (navigation) would never hear
 * about the success, and the user would not be told that the appointment is cancelled.
 */
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
