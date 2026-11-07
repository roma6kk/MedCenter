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

export function cancelAppointment(appointmentId: string, reason: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE_PATH}/${encodeURIComponent(appointmentId)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}
