'use client';

import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useMemo } from 'react';
import { useAdminUsers } from '../users/use-admin-users';
import type { AuditEvent } from './audit-types';
import { CopyRequestId } from './copy-request-id';

interface AuditTableProps {
  readonly rows: ReadonlyArray<AuditEvent>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
}

function resourceOf(event: AuditEvent): string {
  if (event.resourceType === '') return '—';
  return event.resourceId === '' ? event.resourceType : `${event.resourceType}/${event.resourceId}`;
}

/** Account id → «Фамилия Имя», from the first 100 accounts; an id it does not know (a service, an older account) stays raw. */
function useAccountNames(): ReadonlyMap<string, string> {
  const users = useAdminUsers({ page: 1, role: '', search: '', pageSize: 100 });
  return useMemo(() => new Map((users.data?.items ?? []).filter((user) => typeof user.name === 'string').map((user) => [user.id, user.name])), [users.data]);
}

function WhoCell({ userId, name }: { readonly userId: string; readonly name: string | undefined }): React.JSX.Element {
  if (name === undefined) return <span className="mono break-all text-xs">{userId}</span>;
  return (
    <span className="grid">
      <span>{name}</span>
      <span className="mono break-all text-xs text-[var(--muted-foreground)]">{userId}</span>
    </span>
  );
}

function useAuditColumns(): ReadonlyArray<TableColumn<AuditEvent>> {
  const t = useT('admin.audit');
  const locale = useUiStore((state) => state.locale);
  const names = useAccountNames();
  return [
    { key: 'occurredAt', header: t('columns.occurredAt'), render: (row) => <time dateTime={row.occurredAt} className="whitespace-nowrap">{formatClinicDateTime(row.occurredAt, locale)}</time> },
    { key: 'userId', header: t('columns.userId'), render: (row) => <WhoCell userId={row.userId} name={names.get(row.userId)} /> },
    { key: 'action', header: t('columns.action'), render: (row) => <CodeChip code={row.action}>{t(`actions.${row.action}`)}</CodeChip> },
    { key: 'resource', header: t('columns.resource'), render: (row) => <span className="mono break-all text-xs">{resourceOf(row)}</span> },
    { key: 'requestId', header: t('columns.requestId'), render: (row) => <CopyRequestId requestId={row.requestId} /> },
  ];
}

/** The audit journal (FR-021): when, who, what, on which resource, and the request id for support. */
export function AuditTable({ rows, meta, onPage }: AuditTableProps): React.JSX.Element {
  const t = useT('admin.audit');
  const columns = useAuditColumns();
  return <PaginatedTable<AuditEvent> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
