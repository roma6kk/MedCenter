'use client';

import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useMemo } from 'react';
import { Eye, CirclePlus, Pencil, ShieldAlert, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useAdminUsers } from '../users/use-admin-users';
import type { AuditAction, AuditEvent } from './audit-types';
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

// Doctors and administrators are asked for on their own: a clinic with hundreds of patients would push a new doctor past the first 100 accounts.
function useAccountNames(): ReadonlyMap<string, string> {
  const doctors = useAdminUsers({ page: 1, role: 'DOCTOR', search: '', pageSize: 100 });
  const admins = useAdminUsers({ page: 1, role: 'ADMIN', search: '', pageSize: 100 });
  const everyone = useAdminUsers({ page: 1, role: '', search: '', pageSize: 100 });
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const source of [doctors.data, admins.data, everyone.data]) {
      for (const user of source?.items ?? []) {
        if (typeof user.name === 'string' && !names.has(user.id)) names.set(user.id, user.name);
      }
    }
    return names;
  }, [doctors.data, admins.data, everyone.data]);
}

function WhoCell({ userId, name }: { readonly userId: string; readonly name: string | undefined }): React.JSX.Element {
  if (name === undefined) return <span className="mono text-xs">{userId}</span>;
  return (
    <span className="grid">
      <span className="truncate">{name}</span>
      <span className="mono truncate text-xs text-muted-foreground">{userId}</span>
    </span>
  );
}

interface ActionLook {
  readonly tone: BadgeTone;
  readonly icon: LucideIcon;
}

const ACTION_LOOK: Readonly<Record<AuditAction, ActionLook>> = {
  read: { tone: 'neutral', icon: Eye },
  create: { tone: 'success', icon: CirclePlus },
  update: { tone: 'info', icon: Pencil },
  delete: { tone: 'critical', icon: Trash2 },
  denied: { tone: 'warning', icon: ShieldAlert },
  'emergency-bypass': { tone: 'critical', icon: TriangleAlert },
};

function ActionCell({ event }: { readonly event: AuditEvent }): React.JSX.Element {
  const t = useT('admin.audit');
  return (
    <span className="grid gap-1">
      <Badge shape="tag" data-testid={`audit-action-${event.action}`} title={event.action} tone={ACTION_LOOK[event.action]?.tone ?? 'neutral'} icon={ACTION_LOOK[event.action]?.icon} className="justify-self-start">
        {t(`actions.${event.action}`)}
      </Badge>
      {event.reason === undefined ? null : <span className="text-xs">{t('reason', { reason: event.reason })}</span>}
    </span>
  );
}

function useAuditColumns(): ReadonlyArray<TableColumn<AuditEvent>> {
  const t = useT('admin.audit');
  const locale = useUiStore((state) => state.locale);
  const names = useAccountNames();
  return [
    { key: 'occurredAt', header: t('columns.occurredAt'), render: (row) => <time dateTime={row.occurredAt} className="whitespace-nowrap">{formatClinicDateTime(row.occurredAt, locale)}</time> },
    { key: 'userId', header: t('columns.userId'), render: (row) => <WhoCell userId={row.userId} name={names.get(row.userId)} />, truncate: 'max-w-[16rem]', titleOf: (row) => [names.get(row.userId), row.userId].filter(Boolean).join(' · ') },
    { key: 'action', header: t('columns.action'), mobile: 'title', render: (row) => <ActionCell event={row} /> },
    { key: 'resource', header: t('columns.resource'), render: (row) => <span className="mono text-xs">{resourceOf(row)}</span>, truncate: 'max-w-[18rem]', titleOf: resourceOf },
    { key: 'requestId', header: t('columns.requestId'), render: (row) => <CopyRequestId requestId={row.requestId} /> },
  ];
}

export function AuditTable({ rows, meta, onPage }: AuditTableProps): React.JSX.Element {
  const t = useT('admin.audit');
  const columns = useAuditColumns();
  return <PaginatedTable<AuditEvent> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
