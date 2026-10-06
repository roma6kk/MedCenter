'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { PaginatedTable, type PageMeta } from '@/components/data-display/paginated-table';
import { TableSkeleton, EmptyState } from '@/components/feedback/states';

interface Row {
  id: string;
  name: string;
}

export default function AdminServicesPage(): React.JSX.Element {
  const [pageNum, setPageNum] = useState(1);
  const { data, isPending } = useQuery({
    queryKey: ['admin-services', { page: String(pageNum) }],
    queryFn: () => apiFetch<{ items: Row[]; meta: PageMeta }>(`/api/v1/admin/services?page=${pageNum}`),
  });
  return (
    <StaffShell links={ADMIN_LINKS} title="Услуги">
      <h1 className="serif text-2xl font-bold">Услуги</h1>
      {isPending ? (
        <div className="mt-4">
          <TableSkeleton />
        </div>
      ) : null}
      {data && data.items.length === 0 ? <EmptyState title="Пусто" /> : null}
      {data ? (
        <div className="mt-4">
          <PaginatedTable<Row>
            rowKey={(row) => row.id}
            meta={data.meta}
            onPage={setPageNum}
            rows={data.items}
            columns={[{ key: 'name', header: 'Название', render: (row) => row.name }]}
          />
        </div>
      ) : null}
    </StaffShell>
  );
}
