import type { QueryParams } from '@/lib/api/query-string';
import { DEFAULT_AUDIT_DAYS, lastDaysRange, validateReportRange, type ReportRangeError } from '../shared/report-range';

export interface AuditFilter {
  readonly from: string;
  readonly to: string;
  readonly entity: string;
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
