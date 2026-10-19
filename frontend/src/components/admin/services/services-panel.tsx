'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { ServiceFormDialog } from './service-form-dialog';
import { ServicesTable } from './services-table';
import type { AdminService } from './service-types';
import { AdminPageHeader } from '../shared/admin-page-header';
import { CreateButton } from '../shared/create-button';
import { DeleteConfirm } from '../shared/delete-confirm';
import { QueryState } from '../shared/query-state';
import { SearchForm } from '../shared/search-form';
import { useStepBackWhenPageEmpty } from '../shared/use-step-back-when-page-empty';
import { useAdminServices, useDeleteService, type ServicesFilter } from './use-admin-services';

type DialogState = { readonly kind: 'none' } | { readonly kind: 'create' } | { readonly kind: 'edit'; readonly service: AdminService } | { readonly kind: 'delete'; readonly service: AdminService };

function DeleteServiceDialog({ service, onClose }: { readonly service: AdminService; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.services');
  const mutation = useDeleteService();
  return (
    <DeleteConfirm
      title={t('deleteTitle')}
      message={t('deleteMessage', { name: service.name })}
      confirmLabel={t('delete')}
      targetId={service.id}
      mutation={mutation}
      onClose={onClose}
    />
  );
}

function ServiceDialogs({ dialog, onClose }: { readonly dialog: DialogState; readonly onClose: () => void }): ReactNode {
  if (dialog.kind === 'create') return <ServiceFormDialog onClose={onClose} />;
  if (dialog.kind === 'edit') return <ServiceFormDialog service={dialog.service} onClose={onClose} />;
  if (dialog.kind === 'delete') return <DeleteServiceDialog service={dialog.service} onClose={onClose} />;
  return null;
}

/** `/admin/services` (FR-016): search, the server-paged catalogue, create / edit / delete. */
export function ServicesPanel(): ReactNode {
  const t = useT('admin.services');
  const [filter, setFilter] = useState<ServicesFilter>({ page: 1, search: '' });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const query = useAdminServices(filter);
  useStepBackWhenPageEmpty(query.data, filter.page, (page) => setFilter({ ...filter, page }));
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={() => setDialog({ kind: 'create' })} />} />
      <SearchForm label={t('searchLabel')} value={filter.search} onApply={(search) => setFilter({ page: 1, search })} />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}>
        {(data) => (
          <ServicesTable
            rows={data.items}
            meta={data.meta}
            onPage={(page) => setFilter({ ...filter, page })}
            onEdit={(service) => setDialog({ kind: 'edit', service })}
            onDelete={(service) => setDialog({ kind: 'delete', service })}
          />
        )}
      </QueryState>
      <ServiceDialogs dialog={dialog} onClose={() => setDialog({ kind: 'none' })} />
    </>
  );
}
