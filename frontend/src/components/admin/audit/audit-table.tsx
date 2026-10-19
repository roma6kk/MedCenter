'use client';

import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicDateTime } from '../shared/admin-dates';
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

function useAuditColumns(): ReadonlyArray<TableColumn<AuditEvent>> {
  const t = useT('admin.audit');
  const locale = useUiStore((state) => state.locale);
  return [
    { key: 'occurredAt', header: t('columns.occurredAt'), render: (row) => <time dateTime={row.occurredAt} className="whitespace-nowrap">{formatClinicDateTime(row.occurredAt, locale)}</time> },
    { key: 'userId', header: t('columns.userId'), render: (row) => <span className="mono break-all text-xs">{row.userId}</span> },
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
