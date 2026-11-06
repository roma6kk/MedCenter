import { apiFetch } from '@/lib/api/api-fetch';
import type { PageParams, PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';

export interface NotificationItem {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly sent: string;
  readonly read: boolean;
  readonly kind?: string;
  readonly start?: string;
  readonly appointmentId?: string;
  readonly encounterId?: string;
}

export interface NotificationListParams extends PageParams {
  readonly unread?: boolean;
}

interface UnreadCountResponse {
  readonly count: number;
}

const BASE_PATH = '/api/v1/notifications';

export async function fetchUnreadCount(): Promise<number> {
  const response = await apiFetch<UnreadCountResponse>(`${BASE_PATH}/unread-count`);
  return typeof response.count === 'number' ? response.count : 0;
}

export function fetchNotifications(params: NotificationListParams = {}): Promise<PaginatedResponse<NotificationItem>> {
  return apiFetch<PaginatedResponse<NotificationItem>>(withQuery(BASE_PATH, { ...params, unread: params.unread === true ? true : undefined }));
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`${BASE_PATH}/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

interface ReadAllResponse {
  readonly updated: number;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await apiFetch<ReadAllResponse>(`${BASE_PATH}/read-all`, { method: 'POST' });
  return typeof response?.updated === 'number' ? response.updated : 0;
}
