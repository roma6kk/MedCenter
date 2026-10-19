'use client';

import { keepPreviousData, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { toPaginated, type PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import type { SlotStatus } from '@/components/feedback/stamp-badge';
import type { AdminSchedule, CreateSchedulePayload, GenerateSlotsPayload, GenerateSlotsResult, ScheduleSlot, UpdateSchedulePayload } from './schedule-types';
import { useAdminMutation } from '../shared/use-admin-mutation';

export const SCHEDULES_PAGE_SIZE = 10;

export interface SchedulesFilter {
  readonly page: number;
  /** `PractitionerRole` id; empty = every doctor. */
  readonly doctorId: string;
  readonly active: 'true' | 'false' | '';
}

export function useAdminSchedules(filter: SchedulesFilter): UseQueryResult<PaginatedResponse<AdminSchedule>, Error> {
  const params = { page: filter.page, pageSize: SCHEDULES_PAGE_SIZE, doctorId: filter.doctorId, active: filter.active };
  return useQuery({
    queryKey: queryKeys.adminSchedules(params),
    queryFn: async () => toPaginated(await apiFetch<PaginatedResponse<AdminSchedule> | ReadonlyArray<AdminSchedule>>(withQuery('/api/v1/admin/schedules', params))),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSchedule(): UseMutationResult<AdminSchedule, Error, CreateSchedulePayload> {
  return useAdminMutation<CreateSchedulePayload, AdminSchedule>({
    mutationFn: (payload) => apiFetch<AdminSchedule>('/api/v1/admin/schedules', { method: 'POST', body: JSON.stringify(payload) }),
    invalidates: 'admin-schedules',
    successMessageKey: 'admin.schedules.toast.created',
  });
}

export interface UpdateScheduleVars {
  readonly id: string;
  readonly payload: UpdateSchedulePayload;
}

export function useUpdateSchedule(): UseMutationResult<AdminSchedule, Error, UpdateScheduleVars> {
  return useAdminMutation<UpdateScheduleVars, AdminSchedule>({
    mutationFn: ({ id, payload }) => apiFetch<AdminSchedule>(`/api/v1/admin/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    invalidates: 'admin-schedules',
    successMessageKey: 'admin.schedules.toast.updated',
  });
}

export interface DeleteScheduleVars {
  readonly id: string;
  /** `true` also removes the free slots; busy slots protect the schedule either way (409 `SCHEDULE_IN_USE`). */
  readonly cascade: boolean;
}

export function useDeleteSchedule(): UseMutationResult<void, Error, DeleteScheduleVars> {
  return useAdminMutation<DeleteScheduleVars, void>({
    mutationFn: ({ id, cascade }) => apiFetch<void>(`/api/v1/admin/schedules/${id}`, { method: 'DELETE', body: JSON.stringify({ cascade }) }),
    invalidates: 'admin-schedules',
    successMessageKey: 'admin.schedules.toast.deleted',
  });
}

export interface GenerateSlotsVars extends GenerateSlotsPayload {
  readonly idempotencyKey: string;
}

/** `POST /admin/schedules/{id}/generate` (201 `{generated, skipped}`) with the `Idempotency-Key` of the intent. */
export function useGenerateSlots(scheduleId: string): UseMutationResult<GenerateSlotsResult, Error, GenerateSlotsVars> {
  return useAdminMutation<GenerateSlotsVars, GenerateSlotsResult>({
    mutationFn: ({ from, to, idempotencyKey }) =>
      apiFetch<GenerateSlotsResult>(`/api/v1/admin/schedules/${scheduleId}/generate`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ from, to }),
      }),
    invalidates: 'generate-slots',
    successMessageKey: 'admin.slots.generate.done',
  });
}

export interface SlotsQuery {
  readonly from: string;
  readonly to: string;
  /** Empty = the API's default (`free` and `busy`); `entered-in-error` slots are only returned when asked for. */
  readonly status: SlotStatus | '';
}

/** `isEnabled = false` holds the request back while the period cannot be sent (the server answers 400 without both dates). */
export function useScheduleSlots(scheduleId: string, range: SlotsQuery, isEnabled = true): UseQueryResult<ReadonlyArray<ScheduleSlot>, Error> {
  return useQuery({
    queryKey: queryKeys.adminScheduleSlots(scheduleId, { from: range.from, to: range.to, status: range.status }),
    queryFn: () => apiFetch<ReadonlyArray<ScheduleSlot>>(withQuery(`/api/v1/admin/schedules/${scheduleId}/slots`, { ...range })),
    enabled: isEnabled,
  });
}
