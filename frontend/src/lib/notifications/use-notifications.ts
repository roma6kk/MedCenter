'use client';

/**
 * Notification hooks (patient). Polling follows ADR-015: `refetchInterval` every 30 s while the window has focus, no SSE.
 * Doctors and administrators have no notification endpoints (the service answers 403 to them), so every hook is
 * disabled for any role other than PATIENT and never fires a request for them.
 */
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
  const enabled: boolean = useIsPatientSession();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => fetchUnreadCount(),
    enabled,
    staleTime: STALE_TIME_MS.notifications,
    refetchInterval: POLL_INTERVAL_MS.unreadCount,
    // ADR-015: poll while the user is looking at the page; a background tab catches up on focus.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useNotifications(params: NotificationListParams = {}): UseQueryResult<PaginatedResponse<NotificationItem>> {
  const enabled: boolean = useIsPatientSession();
  return useQuery({
    queryKey: queryKeys.notifications({ ...params }),
    queryFn: () => fetchNotifications(params),
    enabled,
    staleTime: STALE_TIME_MS.notifications,
    refetchInterval: POLL_INTERVAL_MS.unreadCount,
    refetchIntervalInBackground: false,
  });
}

/** Marks one notification read, then refreshes the list and the counter (§5.1: `read` → `notifications`, `unreadCount`). */
export function useMarkNotificationRead(): UseMutationResult<void, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => invalidateFor(client, 'read-notification'),
  });
}

/** Marks every unread notification read in one request (API 8.4); the list and the counter are re-read whatever the answer was. */
export function useMarkAllNotificationsRead(): UseMutationResult<number, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    // Some notifications may have been marked even when the answer failed: always show the real state.
    onSettled: () => invalidateFor(client, 'read-notification'),
  });
}
