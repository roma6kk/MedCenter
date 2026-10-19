/**
 * audit-filter — the filters of `GET /api/v1/admin/audit?from=&to=&entity=&userId=` (api-designer-spec §9.4) with the
 * same patterns the analytics service validates, so a typo is caught before the request (it would answer 400).
 */
import type { QueryParams } from '@/lib/api/query-string';
import { DEFAULT_AUDIT_DAYS, lastDaysRange, validateReportRange, type ReportRangeError } from '../shared/report-range';

export interface AuditFilter {
  readonly from: string;
  readonly to: string;
  /** A resource type (`Appointment`) or one resource (`Appointment/123`); empty = any. */
  readonly entity: string;
  /** The `sub` of a token or an agent reference; empty = anyone. */
  readonly userId: string;
}

export interface AuditFilterErrors {
  readonly range?: ReportRangeError;
  readonly entity?: true;
  readonly userId?: true;
}

export const AUDIT_PAGE_SIZE = 20;

const ENTITY_PATTERN = /^[A-Z][A-Za-z]{1,63}(\/[A-Za-z0-9\-.]{1,64})?$/;
const USER_ID_PATTERN = /^[A-Za-z0-9\-._:@/]{1,128}$/;

export function defaultAuditFilter(today?: string): AuditFilter {
  return { ...lastDaysRange(DEFAULT_AUDIT_DAYS, today), entity: '', userId: '' };
}

export function validateAuditFilter(filter: AuditFilter): AuditFilterErrors {
  const range: ReportRangeError | null = validateReportRange(filter);
  const entity: string = filter.entity.trim();
  const userId: string = filter.userId.trim();
  return {
    ...(range === null ? {} : { range }),
    ...(entity !== '' && !ENTITY_PATTERN.test(entity) ? { entity: true as const } : {}),
    ...(userId !== '' && !USER_ID_PATTERN.test(userId) ? { userId: true as const } : {}),
  };
}

export function hasAuditFilterErrors(errors: AuditFilterErrors): boolean {
  return errors.range !== undefined || errors.entity === true || errors.userId === true;
}

/** Query parameters of one page; blank filters are left out. */
export function toAuditParams(filter: AuditFilter, page: number): QueryParams {
  return {
    from: filter.from,
    to: filter.to,
    entity: filter.entity.trim(),
    userId: filter.userId.trim(),
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
