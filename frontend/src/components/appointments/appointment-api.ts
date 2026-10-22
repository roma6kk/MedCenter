/**
 * appointment-api — client of appointment-service for the patient (api-designer-spec §6).
 *
 * `GET /api/v1/appointments` (6.2) lists the caller's own appointments: the patient comes from the token, never from a
 * parameter (ADR-013), and the service sorts by `start` only. It is `/appointments`, not `/me/appointments`.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import type { AppointmentTab, AppointmentView } from './appointment-types';

const BASE_PATH = '/api/v1/appointments';

export interface AppointmentListParams {
  readonly tab: AppointmentTab;
  readonly page: number;
  readonly pageSize: number;
}

/** What is ahead holds only booked visits, soonest first (6.2 `status`); the history keeps every status, newest first. */
export function listQueryOf({ tab, page, pageSize }: AppointmentListParams): Readonly<Record<string, string | number | undefined>> {
  const upcoming: boolean = tab === 'upcoming';
  return { page, pageSize, upcoming: upcoming ? 'true' : undefined, status: upcoming ? 'booked' : undefined, sortOrder: upcoming ? 'asc' : 'desc' };
}

export function fetchAppointments(params: AppointmentListParams): Promise<PaginatedResponse<AppointmentView>> {
  return apiFetch<PaginatedResponse<AppointmentView>>(withQuery(BASE_PATH, listQueryOf(params)));
}

export function fetchAppointment(appointmentId: string): Promise<AppointmentView> {
  return apiFetch<AppointmentView>(`${BASE_PATH}/${encodeURIComponent(appointmentId)}`);
}

/** `POST /appointments/{id}/cancel` (6.4): the reason is 3…500 characters and ends up as `statusReason`. */
export function cancelAppointment(appointmentId: string, reason: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE_PATH}/${encodeURIComponent(appointmentId)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
