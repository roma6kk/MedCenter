'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useDoctors } from '@/components/catalog/use-catalog';
import { DeleteConfirm } from '../shared/delete-confirm';
import { AdminPageHeader } from '../shared/admin-page-header';
import { AdminProblem } from '../shared/admin-problem';
import { CreateButton } from '../shared/create-button';
import { QueryState } from '../shared/query-state';
import { useAdminUsers, useDeactivateUser, useUpdateUser, type UsersFilter } from './use-admin-users';
import { RetentionExpiredSection } from './retention-expired-section';
import { UserFormDialog } from './user-form-dialog';
import { UsersFilterForm } from './users-filter-form';
import { UsersTable } from './users-table';
import { USER_ROLES, type AdminUser } from './user-types';
import { parsePage, useUrlState } from '@/hooks/use-url-state';
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

const DOCTORS_PAGE_SIZE = 100;

function usePractitionerRoleSpecialties(): ReadonlyMap<string, string> {
  const doctors = useDoctors({ pageSize: DOCTORS_PAGE_SIZE });
  const items = doctors.data?.items;
  return useMemo(() => {
    const specialties = new Map<string, string>();
    (items ?? []).forEach((doctor) => (doctor.practitionerRoleIds ?? []).forEach((roleId) => doctor.specialty === undefined || specialties.set(roleId, doctor.specialty)));
    return specialties;
  }, [items]);
}

export function UsersPanel(): ReactNode {
  const t = useT('admin.users');
  const [url, setUrl] = useUrlState({ role: '', search: '', page: '1' });
  const filter: UsersFilter = { page: parsePage(url.page), role: USER_ROLES.find((role) => role === url.role) ?? '', search: url.search };
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const query = useAdminUsers(filter);
  const activate = useUpdateUser('admin.users.toast.activated');
  const practitionerRoles = usePractitionerRoleSpecialties();
  const closeDialog = (): void => setDialog({ kind: 'none' });
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={() => setDialog({ kind: 'create' })} />} />
      <UsersFilterForm role={filter.role} search={filter.search} onApply={(role, search) => { activate.reset(); setUrl({ role, search, page: '1' }); }} />
      {activate.isError ? <div className="mb-3"><AdminProblem error={activate.error} /></div> : null}
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}>
        {(data) => (
          <UsersTable
            consentLinks
            practitionerRoles={practitionerRoles}
            rows={data.items}
            meta={data.meta}
            onPage={(page) => { activate.reset(); setUrl({ page: String(page) }); }}
            onEdit={(user) => setDialog({ kind: 'edit', user })}
            onDeactivate={(user) => setDialog({ kind: 'deactivate', user })}
            onActivate={(user) => { if (!activate.isPending) activate.mutate({ id: user.id, payload: { isActive: true } }); }}
          />
        )}
      </QueryState>
      <RetentionExpiredSection />
      <UserDialogs dialog={dialog} onClose={closeDialog} />
    </>
  );
}
