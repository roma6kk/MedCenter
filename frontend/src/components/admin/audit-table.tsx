'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { PaginatedTable, type PageMeta } from '@/components/data-display/paginated-table';
import { TableSkeleton } from '@/components/feedback/states';

interface AuditRow { id: string; occurredAt: string; userId: string; action: string; resourceType: string; resourceId: string; requestId: string; }

export function AuditTable(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const { data, isPending } = useQuery({
    queryKey: ['audit', { page: String(page) }],
    queryFn: () => apiFetch<{ items: AuditRow[]; meta: PageMeta }>(`/api/v1/admin/audit?page=${page}`),
  });
  if (isPending) return <TableSkeleton />;
  if (!data) return <p>Нет данных</p>;
  return (
    <PaginatedTable<AuditRow>
      rowKey={(row) => row.id}
      meta={data.meta}
      onPage={setPage}
      rows={data.items}
      columns={[
        { key: 'occurredAt', header: 'Время', render: (row) => row.occurredAt },
        { key: 'userId', header: 'Пользователь', render: (row) => row.userId },
        { key: 'action', header: 'Действие', render: (row) => row.action },
        { key: 'resource', header: 'Ресурс', render: (row) => `${row.resourceType}/${row.resourceId}` },
        { key: 'requestId', header: 'RequestId', render: (row) => <span className="mono text-xs">{row.requestId} <button type="button" aria-label={`Скопировать ${row.requestId}`} onClick={() => void navigator.clipboard.writeText(row.requestId)} className="underline">копировать</button></span> },
      ]}
    />
  );
}
