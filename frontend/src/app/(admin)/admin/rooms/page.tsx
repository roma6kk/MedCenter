'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { PaginatedTable, type PageMeta } from '@/components/data-display/paginated-table';
import { RoomUsageDrawer } from '@/components/admin/room-usage-drawer';
import { TableSkeleton, EmptyState } from '@/components/feedback/states';

interface Row {
  id: string;
  name: string;
}

export default function AdminRoomsPage(): React.JSX.Element {
  const [pageNum, setPageNum] = useState(1);
  const [usageRoomId, setUsageRoomId] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ['admin-rooms', { page: String(pageNum) }],
    queryFn: () => apiFetch<{ items: Row[]; meta: PageMeta }>(`/api/v1/admin/rooms?page=${pageNum}`),
  });
  return (
    <StaffShell links={ADMIN_LINKS} title="Кабинеты">
      <h1 className="serif text-2xl font-bold">Кабинеты</h1>
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
            columns={[
              { key: 'name', header: 'Название', render: (row) => row.name },
              {
                key: 'usage',
                header: 'Занятость',
                render: (row) => (
                  <button type="button" onClick={() => setUsageRoomId(row.id)} className="underline">
                    Посмотреть
                  </button>
                ),
              },
            ]}
          />
        </div>
      ) : null}
      {usageRoomId !== null ? <RoomUsageDrawer roomId={usageRoomId} onClose={() => setUsageRoomId(null)} /> : null}
    </StaffShell>
  );
}
