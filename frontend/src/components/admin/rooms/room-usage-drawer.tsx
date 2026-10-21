'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import type { RoomUsage } from './room-types';
import { SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { Modal } from '../shared/modal';
import { QueryState } from '../shared/query-state';
import { useRoomUsage } from './use-admin-rooms';

function UsageList({ usage }: { readonly usage: RoomUsage }): ReactNode {
  const t = useT('admin.rooms');
  return (
    <>
      <p role="status" className="mt-3 text-sm font-medium">
        {usage.inUse === false ? t('usage.free') : t('usage.inUse')}
      </p>
      <ul className="mt-3 grid gap-2">
        {usage.items.map((reference) => (
          <li key={`${reference.resourceType}-${reference.id}`} className="rounded-control border border-[var(--border)] p-3 text-sm">
            <CodeChip code={reference.resourceType}>{t(`usage.types.${reference.resourceType}`)}</CodeChip>{' '}
            {reference.display}
            {reference.isActive === false ? <span className="ml-1 text-xs text-[var(--muted-foreground)]">{t('usage.inactive')}</span> : null}
          </li>
        ))}
      </ul>
      {usage.truncated === true ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t('usage.truncated')}</p> : null}
    </>
  );
}

interface RoomUsageDrawerProps {
  readonly roomId: string;
  readonly roomName?: string;
  readonly onClose: () => void;
}

/**
 * Room occupancy side panel (api-designer-spec §4.7): the schedules and booked slots that block deleting the room
 * (409 `ROOM_IN_USE`, FR-017). Mount it only while open; it traps focus and closes on Escape.
 */
export function RoomUsageDrawer({ roomId, roomName, onClose }: RoomUsageDrawerProps): ReactNode {
  const t = useT('admin.rooms');
  const query = useRoomUsage(roomId);
  return (
    <Modal title={t('usage.title')} onClose={onClose} variant="drawer">
      {roomName ? <p className="text-sm text-[var(--muted-foreground)]">{roomName}</p> : null}
      <QueryState query={query} isEmpty={(usage) => usage.items.length === 0} emptyTitle={t('usage.freeTitle')} emptyDescription={t('usage.freeHint')}>
        {(usage) => <UsageList usage={usage} />}
      </QueryState>
      <div className="mt-4">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
          {t('usage.close')}
        </button>
      </div>
    </Modal>
  );
}

