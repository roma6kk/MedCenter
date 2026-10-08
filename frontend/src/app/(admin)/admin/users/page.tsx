'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import type { PageMeta } from '@/components/data-display/paginated-table';
import { UsersTable, type UserRow } from '@/components/admin/users-table';
import { TableSkeleton, EmptyState } from '@/components/feedback/states';

export default function AdminUsersPage(): React.JSX.Element {
  const [pageNum, setPageNum] = useState(1);
  const { data, isPending } = useQuery({
    queryKey: ['admin-users', { page: String(pageNum) }],
    queryFn: () => apiFetch<{ items: UserRow[]; meta: PageMeta }>(`/api/v1/admin/users?page=${pageNum}`),
  });
  return (
    <StaffShell links={ADMIN_LINKS} title="Пользователи">
      <h1 className="serif text-2xl font-bold">Пользователи</h1>
      {isPending ? (
        <div className="mt-4">
          <TableSkeleton />
        </div>
      ) : null}
      {data && data.items.length === 0 ? <EmptyState title="Пусто" /> : null}
      {data ? (
        <div className="mt-4">
          <UsersTable rows={data.items} meta={data.meta} onPage={setPageNum} />
        </div>
      ) : null}
    </StaffShell>
  );
}
