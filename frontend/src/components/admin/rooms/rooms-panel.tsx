'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { RoomFormDialog } from './room-form-dialog';
import { RoomUsageDrawer } from './room-usage-drawer';
import { RoomsTable } from './rooms-table';
import type { AdminRoom } from './room-types';
import { AdminPageHeader } from '../shared/admin-page-header';
import { CreateButton } from '../shared/create-button';
import { DeleteConfirm } from '../shared/delete-confirm';
import { QueryState } from '../shared/query-state';
import { useStepBackWhenPageEmpty } from '../shared/use-step-back-when-page-empty';
import { useAdminRooms, useDeleteRoom } from './use-admin-rooms';

type DialogState =
  | { readonly kind: 'none' }
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly room: AdminRoom }
  | { readonly kind: 'delete'; readonly room: AdminRoom }
  | { readonly kind: 'usage'; readonly room: AdminRoom };

function DeleteRoomDialog({ room, onClose }: { readonly room: AdminRoom; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.rooms');
  const mutation = useDeleteRoom();
  return (
    <DeleteConfirm title={t('deleteTitle')} message={t('deleteMessage', { name: room.name })} confirmLabel={t('delete')} targetId={room.id} mutation={mutation} onClose={onClose} />
  );
}

function RoomDialogs({ dialog, onClose }: { readonly dialog: DialogState; readonly onClose: () => void }): ReactNode {
  if (dialog.kind === 'create') return <RoomFormDialog onClose={onClose} />;
  if (dialog.kind === 'edit') return <RoomFormDialog room={dialog.room} onClose={onClose} />;
  if (dialog.kind === 'delete') return <DeleteRoomDialog room={dialog.room} onClose={onClose} />;
  if (dialog.kind === 'usage') return <RoomUsageDrawer roomId={dialog.room.id} roomName={dialog.room.name} onClose={onClose} />;
  return null;
}

/** `/admin/rooms` (FR-017): the server-paged room list; create, edit, delete and the occupancy drawer. */
export function RoomsPanel(): ReactNode {
  const t = useT('admin.rooms');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const query = useAdminRooms(page);
  useStepBackWhenPageEmpty(query.data, page, setPage);
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={() => setDialog({ kind: 'create' })} />} />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}>
        {(data) => (
          <RoomsTable
            rows={data.items}
            meta={data.meta}
            onPage={setPage}
            onUsage={(room) => setDialog({ kind: 'usage', room })}
            onEdit={(room) => setDialog({ kind: 'edit', room })}
            onDelete={(room) => setDialog({ kind: 'delete', room })}
          />
        )}
      </QueryState>
      <RoomDialogs dialog={dialog} onClose={() => setDialog({ kind: 'none' })} />
    </>
  );
}
