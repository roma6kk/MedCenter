'use client';

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import { toAuditParams, type AuditFilter } from './audit-filter';
import type { AuditEvent } from './audit-types';

/** One page of the audit journal (`GET /admin/audit`, API 9.4); the previous page stays on screen while the next loads. */
export function useAuditEvents(filter: AuditFilter, page: number): UseQueryResult<PaginatedResponse<AuditEvent>, Error> {
  const params = toAuditParams(filter, page);
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: () => apiFetch<PaginatedResponse<AuditEvent>>(withQuery('/api/v1/admin/audit', params)),
    placeholderData: keepPreviousData,
  });
}
