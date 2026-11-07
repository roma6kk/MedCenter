'use client';

import { useEffect } from 'react';
import { Ban, FileCheck2, IdCard, Pencil, Stethoscope, UserCheck } from 'lucide-react';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { Badge } from '@/components/ui/badge';
import type { MenuItem } from '@/components/ui/dropdown-menu';
import type { Translate } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { rememberPatientNames } from '@/lib/admin-patient-names';
import { USER_ROLES } from './user-types';
import { ActiveStatusBadge } from '../shared/active-status-badge';
import { RowActionsMenu } from '../shared/row-actions-menu';

export interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly role?: string | null;
  readonly roles?: ReadonlyArray<string>;
  readonly isActive?: boolean;
  readonly patientRef?: string | null;
  readonly practitionerRoleRef?: string | null;
}

interface UserActions<TUser extends UserRow> {
  readonly onEdit?: (row: TUser) => void;
  readonly onDeactivate?: (row: TUser) => void;
  readonly onActivate?: (row: TUser) => void;
}

interface UsersTableProps<TUser extends UserRow> extends UserActions<TUser> {
  readonly consentLinks?: boolean;
  readonly practitionerRoles?: ReadonlyMap<string, string>;
  readonly rows: ReadonlyArray<TUser>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
}

function roleLabel(role: string, t: Translate): string {
  return (USER_ROLES as ReadonlyArray<string>).includes(role) ? t(`roleNames.${role}`) : role;
}

function RoleChips({ row }: { readonly row: UserRow }): React.JSX.Element {
  const t = useT('admin.users');
  const roles: ReadonlyArray<string> = row.roles !== undefined && row.roles.length > 0 ? row.roles : row.role ? [row.role] : [];
  if (roles.length === 0) return <>—</>;
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <CodeChip key={role} code={role}>
          {roleLabel(role, t)}
        </CodeChip>
      ))}
    </span>
  );
}

function LinkChips({ row, practitionerRoles }: { readonly row: UserRow; readonly practitionerRoles: ReadonlyMap<string, string> | undefined }): React.JSX.Element {
  const t = useT('admin.users');
  const { patientRef, practitionerRoleRef } = row;
  if (typeof patientRef !== 'string' && typeof practitionerRoleRef !== 'string') return <>—</>;
  const specialty: string | undefined = typeof practitionerRoleRef === 'string' ? practitionerRoles?.get(practitionerRoleRef.split('/').pop() ?? '') : undefined;
  return (
    <span className="flex flex-col items-start gap-1">
      {typeof patientRef === 'string' ? <Badge tone="info" shape="tag" icon={IdCard} title={patientRef}>{t('links.patient')}</Badge> : null}
      {typeof practitionerRoleRef === 'string' ? (
        <Badge tone="primary" shape="tag" icon={Stethoscope} title={practitionerRoleRef}>
          {specialty === undefined ? t('links.doctor') : t('links.doctorWithSpecialty', { specialty })}
        </Badge>
      ) : null}
    </span>
  );
}

function patientIdOf(row: UserRow): string | null {
  const reference: string | null | undefined = row.patientRef;
  return typeof reference === 'string' && reference.startsWith('Patient/') ? reference.slice('Patient/'.length) : null;
}

function RowActions<TUser extends UserRow>({ row, consentLinks, onEdit, onDeactivate, onActivate }: UserActions<TUser> & { readonly row: TUser; readonly consentLinks: boolean }): React.JSX.Element | null {
  const t = useT('admin.users');
  const tConsent = useT('consent.admin');
  const patientId: string | null = patientIdOf(row);
  const items: MenuItem[] = [];
  if (onEdit) items.push({ key: 'edit', label: t('edit'), icon: Pencil, onSelect: () => onEdit(row) });
  if (consentLinks && patientId !== null) {
    items.push({ key: 'consent', label: tConsent('open'), icon: FileCheck2, href: `/admin/patients/${encodeURIComponent(patientId)}/consent` });
  }
  if (row.isActive === false && onActivate) items.push({ key: 'activate', label: t('activate'), icon: UserCheck, onSelect: () => onActivate(row) });
  if (row.isActive !== false && onDeactivate) items.push({ key: 'deactivate', label: t('deactivate'), icon: Ban, destructive: true, onSelect: () => onDeactivate(row) });
  if (items.length === 0) return null;
  return <RowActionsMenu name={row.name} items={items} />;
}

function NameCell({ row }: { readonly row: UserRow }): React.JSX.Element {
  return (
    <span className="grid">
      <span>{row.name}</span>
      {row.email ? <span className="tabular-nums text-xs text-[var(--muted-foreground)]">{row.email}</span> : null}
    </span>
  );
}

function useUserColumns<TUser extends UserRow>(actions: UserActions<TUser>, consentLinks: boolean, practitionerRoles: ReadonlyMap<string, string> | undefined): ReadonlyArray<TableColumn<TUser>> {
  const t = useT('admin.users');
  const columns: TableColumn<TUser>[] = [
    { key: 'name', header: t('columns.name'), render: (row) => <NameCell row={row} /> },
    { key: 'role', header: t('columns.role'), mobile: 'badge', render: (row) => <RoleChips row={row} /> },
    { key: 'status', header: t('columns.status'), mobile: 'badge', render: (row) => <ActiveStatusBadge isActive={row.isActive !== false} activeLabel={t('active')} inactiveLabel={t('inactive')} /> },
    { key: 'links', header: t('columns.links'), render: (row) => <LinkChips row={row} practitionerRoles={practitionerRoles} /> },
  ];
  if (actions.onEdit || actions.onDeactivate || actions.onActivate || consentLinks) {
    columns.push({ key: 'actions', header: t('columns.actions'), mobile: 'actions', render: (row) => <RowActions row={row} consentLinks={consentLinks} {...actions} /> });
  }
  return columns;
}

export function UsersTable<TUser extends UserRow>({ rows, meta, onPage, consentLinks = false, practitionerRoles, onEdit, onDeactivate, onActivate }: UsersTableProps<TUser>): React.JSX.Element {
  const t = useT('admin.users');
  const columns = useUserColumns({ onEdit, onDeactivate, onActivate }, consentLinks, practitionerRoles);
  useEffect(() => {
    if (!consentLinks) return;
    rememberPatientNames(rows.flatMap((row) => {
      const patientId = patientIdOf(row);
      return patientId === null || row.name === '' ? [] : [{ patientId, name: row.name }];
    }));
  }, [rows, consentLinks]);
  return <PaginatedTable<TUser> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
