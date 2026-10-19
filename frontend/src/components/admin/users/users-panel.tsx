'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { DeleteConfirm } from '../shared/delete-confirm';
import { AdminPageHeader } from '../shared/admin-page-header';
import { AdminProblem } from '../shared/admin-problem';
import { CreateButton } from '../shared/create-button';
import { QueryState } from '../shared/query-state';
import { useAdminUsers, useDeactivateUser, useUpdateUser, type UsersFilter } from './use-admin-users';
import { UserFormDialog } from './user-form-dialog';
import { UsersFilterForm } from './users-filter-form';
import { UsersTable } from './users-table';
import type { AdminUser } from './user-types';
import { useT } from '@/lib/i18n/use-t';

type DialogState = { readonly kind: 'none' } | { readonly kind: 'create' } | { readonly kind: 'edit'; readonly user: AdminUser } | { readonly kind: 'deactivate'; readonly user: AdminUser };

function DeactivateUserDialog({ user, onClose }: { readonly user: AdminUser; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.users');
  const mutation = useDeactivateUser();
  return (
    <DeleteConfirm
      title={t('deactivateTitle')}
      message={t('deactivateMessage', { name: user.name })}
      confirmLabel={t('deactivate')}
      targetId={user.id}
      mutation={mutation}
      onClose={onClose}
    />
  );
}

function UserDialogs({ dialog, onClose }: { readonly dialog: DialogState; readonly onClose: () => void }): ReactNode {
  if (dialog.kind === 'create') return <UserFormDialog onClose={onClose} />;
  if (dialog.kind === 'edit') return <UserFormDialog user={dialog.user} onClose={onClose} />;
  if (dialog.kind === 'deactivate') return <DeactivateUserDialog user={dialog.user} onClose={onClose} />;
  return null;
}

/** `/admin/users` (FR-015): filters, the server-paged list, create / edit / deactivate. */
export function UsersPanel(): ReactNode {
  const t = useT('admin.users');
  const [filter, setFilter] = useState<UsersFilter>({ page: 1, role: '', search: '' });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const query = useAdminUsers(filter);
  const activate = useUpdateUser('admin.users.toast.activated');
  const closeDialog = (): void => setDialog({ kind: 'none' });
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={() => setDialog({ kind: 'create' })} />} />
      <UsersFilterForm role={filter.role} search={filter.search} onApply={(role, search) => { activate.reset(); setFilter({ ...filter, page: 1, role, search }); }} />
      {activate.isError ? <div className="mb-3"><AdminProblem error={activate.error} /></div> : null}
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}>
        {(data) => (
          <UsersTable
            rows={data.items}
            meta={data.meta}
            onPage={(page) => { activate.reset(); setFilter({ ...filter, page }); }}
            onEdit={(user) => setDialog({ kind: 'edit', user })}
            onDeactivate={(user) => setDialog({ kind: 'deactivate', user })}
            onActivate={(user) => { if (!activate.isPending) activate.mutate({ id: user.id, payload: { isActive: true } }); }}
          />
        )}
      </QueryState>
      <UserDialogs dialog={dialog} onClose={closeDialog} />
    </>
  );
}
