'use client';

import { keepPreviousData, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { toPaginated, type PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import type { AdminRoom, RoomPayload, RoomUsage } from './room-types';
import { useAdminMutation } from '../shared/use-admin-mutation';

export const ROOMS_PAGE_SIZE = 10;

/** `GET /api/v1/rooms` (API 4.3) is the admin's list too: only create/update/delete/usage live under `/admin`. */
export function useAdminRooms(page: number, pageSize: number = ROOMS_PAGE_SIZE): UseQueryResult<PaginatedResponse<AdminRoom>, Error> {
  const params = { page, pageSize };
  return useQuery({
    queryKey: queryKeys.rooms(params),
    queryFn: async () => toPaginated(await apiFetch<PaginatedResponse<AdminRoom> | ReadonlyArray<AdminRoom>>(withQuery('/api/v1/rooms', params))),
    placeholderData: keepPreviousData,
  });
}

export function useRoomUsage(roomId: string): UseQueryResult<RoomUsage, Error> {
  return useQuery({
    queryKey: queryKeys.roomUsage(roomId),
    queryFn: () => apiFetch<RoomUsage>(`/api/v1/admin/rooms/${roomId}/usage`),
  });
}

export function useCreateRoom(): UseMutationResult<AdminRoom, Error, RoomPayload> {
  return useAdminMutation<RoomPayload, AdminRoom>({
    mutationFn: (payload) => apiFetch<AdminRoom>('/api/v1/admin/rooms', { method: 'POST', body: JSON.stringify(payload) }),
    invalidates: 'admin-rooms',
    successMessageKey: 'admin.rooms.toast.created',
  });
}

export interface UpdateRoomVars {
  readonly id: string;
  readonly payload: RoomPayload;
}

export function useUpdateRoom(): UseMutationResult<AdminRoom, Error, UpdateRoomVars> {
  return useAdminMutation<UpdateRoomVars, AdminRoom>({
    mutationFn: ({ id, payload }) => apiFetch<AdminRoom>(`/api/v1/admin/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    invalidates: 'admin-rooms',
    successMessageKey: 'admin.rooms.toast.updated',
  });
}

/** 409 `ROOM_IN_USE` while a schedule still references the room. */
export function useDeleteRoom(): UseMutationResult<void, Error, string> {
  return useAdminMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/v1/admin/rooms/${id}`, { method: 'DELETE' }),
    invalidates: 'admin-rooms',
    successMessageKey: 'admin.rooms.toast.deleted',
  });
}
