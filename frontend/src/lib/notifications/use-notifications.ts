'use client';

import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { invalidateFor } from '@/lib/api/invalidation';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { POLL_INTERVAL_MS, STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { useSessionStore } from '@/store/use-session-store';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationListParams,
} from './notification-api';

function useIsPatientSession(): boolean {
  const hydrated = useSessionStore((state) => state.hydrated);
  const role = useSessionStore((state) => state.role);
  return hydrated && role === 'PATIENT';
}

export function useUnreadCount(): UseQueryResult<number> {
  const enabled = useIsPatientSession();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => fetchUnreadCount(),
    enabled,
    staleTime: STALE_TIME_MS.notifications,
    refetchInterval: POLL_INTERVAL_MS.unreadCount,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotifications(params: NotificationListParams = {}): UseQueryResult<PaginatedResponse<NotificationItem>> {
  const enabled = useIsPatientSession();
  return useQuery({
    queryKey: queryKeys.notifications({ ...params }),
    queryFn: () => fetchNotifications(params),
    enabled,
    staleTime: STALE_TIME_MS.notifications,
    refetchInterval: POLL_INTERVAL_MS.unreadCount,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead(): UseMutationResult<void, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => invalidateFor(client, 'read-notification'),
  });
}

export function useMarkAllNotificationsRead(): UseMutationResult<number, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSettled: () => invalidateFor(client, 'read-notification'),
  });
}
