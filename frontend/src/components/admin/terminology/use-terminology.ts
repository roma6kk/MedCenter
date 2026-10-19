'use client';

import { useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { toPaginated, type PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { STALE_TIME_MS } from '@/lib/api/query-config';
import { useAdminMutation } from '../shared/use-admin-mutation';
import type { ImportAccepted, ValueSetSummary } from './terminology-types';

/** The seeded ValueSets (2.3.1). Only a terminology import changes them, hence the long cache. */
export function useValueSets(): UseQueryResult<PaginatedResponse<ValueSetSummary>, Error> {
  return useQuery({
    queryKey: queryKeys.valueSets(),
    queryFn: async () => toPaginated(await apiFetch<PaginatedResponse<ValueSetSummary> | ReadonlyArray<ValueSetSummary>>('/api/v1/terminology/value-sets')),
    staleTime: STALE_TIME_MS.terminology,
  });
}

export interface ImportVars {
  readonly snapshotVersion: string;
}

/**
 * `POST /admin/terminology/import` (2.3.4): 202 with the accepted import, 409 `IMPORT_RUNNING` while one runs, 400/422 for a
 * bad version. No `Idempotency-Key`: api-designer-spec §0 limits it to bookings and slot generation, the server ignores it here
 * (a repeated import of the same snapshot is an idempotent upsert anyway).
 */
export function useStartImport(): UseMutationResult<ImportAccepted, Error, ImportVars> {
  return useAdminMutation<ImportVars, ImportAccepted>({
    mutationFn: ({ snapshotVersion }) => apiFetch<ImportAccepted>('/api/v1/admin/terminology/import', { method: 'POST', body: JSON.stringify({ snapshotVersion }) }),
    invalidates: 'terminology-import',
    successMessageKey: 'admin.terminology.toast.accepted',
  });
}
