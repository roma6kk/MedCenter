'use client';

import { keepPreviousData, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { toPaginated, type PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import type { AdminService, ServicePayload } from './service-types';
import { useAdminMutation } from '../shared/use-admin-mutation';

export const SERVICES_PAGE_SIZE = 10;

export interface ServicesFilter {
  readonly page: number;
  readonly search: string;
  readonly pageSize?: number;
}

/** The public catalogue (`GET /api/v1/services`, API 5.1.1): it is also the admin's list, there is no `/admin/services` read. */
export function useAdminServices(filter: ServicesFilter): UseQueryResult<PaginatedResponse<AdminService>, Error> {
  const params = { page: filter.page, pageSize: filter.pageSize ?? SERVICES_PAGE_SIZE, search: filter.search.trim() };
  return useQuery({
    queryKey: queryKeys.services(params),
    queryFn: async () => toPaginated(await apiFetch<PaginatedResponse<AdminService> | ReadonlyArray<AdminService>>(withQuery('/api/v1/services', params))),
    placeholderData: keepPreviousData,
  });
}

export function useCreateService(): UseMutationResult<AdminService, Error, ServicePayload> {
  return useAdminMutation<ServicePayload, AdminService>({
    mutationFn: (payload) => apiFetch<AdminService>('/api/v1/admin/services', { method: 'POST', body: JSON.stringify(payload) }),
    invalidates: 'admin-services',
    successMessageKey: 'admin.services.toast.created',
  });
}

export interface UpdateServiceVars {
  readonly id: string;
  readonly payload: ServicePayload;
}

export function useUpdateService(): UseMutationResult<AdminService, Error, UpdateServiceVars> {
  return useAdminMutation<UpdateServiceVars, AdminService>({
    mutationFn: ({ id, payload }) => apiFetch<AdminService>(`/api/v1/admin/services/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    invalidates: 'admin-services',
    successMessageKey: 'admin.services.toast.updated',
  });
}

/** 409 `SERVICE_IN_USE` while a schedule or an appointment still references the service. */
export function useDeleteService(): UseMutationResult<void, Error, string> {
  return useAdminMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/v1/admin/services/${id}`, { method: 'DELETE' }),
    invalidates: 'admin-services',
    successMessageKey: 'admin.services.toast.deleted',
  });
}
