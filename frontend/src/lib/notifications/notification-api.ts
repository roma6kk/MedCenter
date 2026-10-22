/**
 * notification-api — client of notification-service (api-designer-spec §8, PATIENT only).
 *
 * Verified shapes: `GET /notifications/unread-count` → `{ count }`; `GET /notifications` → `{ items, meta }` with
 * `{ id, category, text, sent, read, appointmentId?, encounterId? }`; `POST /notifications/{id}/read` → 204;
 * `POST /notifications/read-all` → `{ updated }` (8.4). The paths are `/api/v1/notifications*`, not `/me/notifications*`.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { PageParams, PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';

export interface NotificationItem {
  readonly id: string;
  /** `appointment` | `encounter` | `registration` (free text on the server). */
  readonly category: string;
  readonly text: string;
  /** RFC 3339 UTC. */
  readonly sent: string;
  readonly read: boolean;
  /** The appointment the notification is about (`Communication.about`); absent on other and older notifications. */
  readonly appointmentId?: string;
  readonly encounterId?: string;
}

export interface NotificationListParams extends PageParams {
  /** `true` lists only unread notifications. */
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

/** Marks every unread notification of the patient read in one request (API 8.4, up to 200 per call). */
export async function markAllNotificationsRead(): Promise<number> {
  const response = await apiFetch<ReadAllResponse>(`${BASE_PATH}/read-all`, { method: 'POST' });
  return typeof response?.updated === 'number' ? response.updated : 0;
}
