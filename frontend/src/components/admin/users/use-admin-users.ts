'use client';

import { keepPreviousData, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import { useAdminMutation } from '../shared/use-admin-mutation';
import type { AdminUser, CreateUserPayload, RetentionExpiredAccount, UpdateUserPayload, UserRole } from './user-types';

const USERS_PAGE_SIZE = 10;

export interface UsersFilter {
  readonly page: number;
  readonly role: UserRole | '';
  readonly search: string;
  readonly pageSize?: number;
}

export function useAdminUsers(filter: UsersFilter): UseQueryResult<PaginatedResponse<AdminUser>, Error> {
  const params = { page: filter.page, pageSize: filter.pageSize ?? USERS_PAGE_SIZE, role: filter.role, search: filter.search.trim() };
  return useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: () => apiFetch<PaginatedResponse<AdminUser>>(withQuery('/api/v1/admin/users', params)),
    placeholderData: keepPreviousData,
  });
}

export function useRetentionExpired(page: number): UseQueryResult<PaginatedResponse<RetentionExpiredAccount>, Error> {
  const params = { page, pageSize: USERS_PAGE_SIZE };
  return useQuery({
    queryKey: queryKeys.adminUsers({ ...params, report: 'retention-expired' }),
    queryFn: () => apiFetch<PaginatedResponse<RetentionExpiredAccount>>(withQuery('/api/v1/admin/users/retention-expired', params)),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser(): UseMutationResult<AdminUser, Error, CreateUserPayload> {
  return useAdminMutation<CreateUserPayload, AdminUser>({
    mutationFn: (payload) => apiFetch<AdminUser>('/api/v1/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
    invalidates: 'admin-users',
    successMessageKey: 'admin.users.toast.created',
    // The variables hold the new account's password: do not keep them in the mutation cache after the dialog closes.
    gcTime: 0,
  });
}

interface UpdateUserVars {
  readonly id: string;
  readonly payload: UpdateUserPayload;
}

export function useUpdateUser(successMessageKey: string = 'admin.users.toast.updated'): UseMutationResult<AdminUser, Error, UpdateUserVars> {
  return useAdminMutation<UpdateUserVars, AdminUser>({
    mutationFn: ({ id, payload }) => apiFetch<AdminUser>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    invalidates: 'admin-users',
    successMessageKey,
  });
}

export function useDeactivateUser(): UseMutationResult<AdminUser, Error, string> {
  return useAdminMutation<string, AdminUser>({
    mutationFn: (id) => apiFetch<AdminUser>(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
    invalidates: 'admin-users',
    successMessageKey: 'admin.users.toast.deactivated',
  });
}
