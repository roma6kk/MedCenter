import type { QueryParams } from '@/lib/api/query-string';
import { isDateKey } from '@/lib/clinic-time';
import { DEFAULT_AUDIT_DAYS, lastDaysRange, validateReportRange, type ReportRange, type ReportRangeError } from '../shared/report-range';
import type { AuditAction } from './audit-types';

export type AuditActionGroup = 'all' | 'auth' | 'read' | 'changes' | 'emergency';

export const AUDIT_ACTION_GROUPS: ReadonlyArray<AuditActionGroup> = ['all', 'auth', 'read', 'changes', 'emergency'];

export const GROUP_ACTIONS: Readonly<Record<Exclude<AuditActionGroup, 'all'>, ReadonlyArray<AuditAction>>> = {
  auth: ['login', 'login-failed', 'login-throttled', 'logout', 'session-idle'],
  read: ['read', 'denied'],
  changes: ['create', 'update', 'delete'],
  emergency: ['emergency-bypass'],
};

export interface AuditFilter {
  readonly from: string;
  readonly to: string;
  readonly entity: string;
  readonly userId: string;
  readonly group: AuditActionGroup;
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
  return { ...lastDaysRange(DEFAULT_AUDIT_DAYS, today), entity: '', userId: '', group: 'all' };
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
    action: filter.group === 'all' ? undefined : GROUP_ACTIONS[filter.group].join(','),
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

function isAuditGroup(value: string | null): value is AuditActionGroup {
  return AUDIT_ACTION_GROUPS.some((group) => group === value);
}

export function auditFilterFromParams(params: URLSearchParams, today?: string): AuditFilter {
  const initial: AuditFilter = defaultAuditFilter(today);
  const from: string = params.get('from') ?? '';
  const to: string = params.get('to') ?? '';
  const range: ReportRange = isDateKey(from) && isDateKey(to) && validateReportRange({ from, to }) === null ? { from, to } : initial;
  const entity: string = params.get('entity') ?? '';
  const userId: string = params.get('userId') ?? '';
  const group: string | null = params.get('type');
  return {
    from: range.from,
    to: range.to,
    entity: ENTITY_PATTERN.test(entity) ? entity : '',
    userId: USER_ID_PATTERN.test(userId) ? userId : '',
    group: isAuditGroup(group) ? group : 'all',
  };
}

export function auditFilterToQuery(filter: AuditFilter, today?: string): string {
  const initial: AuditFilter = defaultAuditFilter(today);
  const params = new URLSearchParams();
  if (filter.group !== 'all') params.set('type', filter.group);
  if (filter.from !== initial.from || filter.to !== initial.to) {
    params.set('from', filter.from);
    params.set('to', filter.to);
  }
  if (filter.entity.trim() !== '') params.set('entity', filter.entity.trim());
  if (filter.userId.trim() !== '') params.set('userId', filter.userId.trim());
  return params.toString();
}
