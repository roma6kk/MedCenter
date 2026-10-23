'use client';

import Link from 'next/link';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import type { Translate } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { ROW_ACTION_CLASS } from '../shared/admin-styles';
import { USER_ROLES } from './user-types';

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
  /** A row tied to a patient links to that patient's consent page (ADR-019); the admin screen turns it on. */
  readonly consentLinks?: boolean;
  readonly rows: ReadonlyArray<TUser>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
}

/** `Врач` / `Doctor` for a known role, the raw code for one this screen does not know. */
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

/**
 * `ExternalLink` chips: the FHIR resource an account is tied to (`Patient/…`, `PractitionerRole/…`). The whole id is on
 * screen (wrapping where it must): the admin copies a PractitionerRole id from here, and a tooltip is out of reach of a
 * keyboard and a touch screen.
 */
function LinkChips({ row }: { readonly row: UserRow }): React.JSX.Element {
  const links = [row.patientRef, row.practitionerRoleRef].filter((link): link is string => typeof link === 'string');
  if (links.length === 0) return <>—</>;
  return (
    <span className="flex flex-col items-start gap-1">
      {links.map((link) => (
        <span key={link} className="max-w-full break-all">
          <CodeChip code={link} system={link} />
        </span>
      ))}
    </span>
  );
}

function StatusStamp({ row }: { readonly row: UserRow }): React.JSX.Element {
  const t = useT('admin.users');
  return row.isActive === false ? <StampBadge status="cancelled">{t('inactive')}</StampBadge> : <StampBadge status="active">{t('active')}</StampBadge>;
}

/** `Patient/abc` → `abc`; `null` for an account that is not tied to a patient. */
function patientIdOf(row: UserRow): string | null {
  const reference: string | null | undefined = row.patientRef;
  return typeof reference === 'string' && reference.startsWith('Patient/') ? reference.slice('Patient/'.length) : null;
}

function ConsentLink({ row }: { readonly row: UserRow }): React.JSX.Element | null {
  const t = useT('consent.admin');
  const patientId: string | null = patientIdOf(row);
  if (patientId === null) return null;
  return (
    <Link href={`/admin/patients/${encodeURIComponent(patientId)}/consent`} className={ROW_ACTION_CLASS} aria-label={t('openFor', { name: row.name })}>
      {t('open')}
    </Link>
  );
}

function RowActions<TUser extends UserRow>({ row, consentLinks, onEdit, onDeactivate, onActivate }: UserActions<TUser> & { readonly row: TUser; readonly consentLinks: boolean }): React.JSX.Element {
  const t = useT('admin.users');
  return (
    <span className="flex flex-wrap gap-1">
      {consentLinks ? <ConsentLink row={row} /> : null}
      {onEdit ? (
        <button type="button" className={ROW_ACTION_CLASS} onClick={() => onEdit(row)} aria-label={t('editAria', { name: row.name })}>
          {t('edit')}
        </button>
      ) : null}
      {row.isActive === false && onActivate ? (
        <button type="button" className={ROW_ACTION_CLASS} onClick={() => onActivate(row)} aria-label={t('activateAria', { name: row.name })}>
          {t('activate')}
        </button>
      ) : null}
      {row.isActive !== false && onDeactivate ? (
        <button type="button" className={ROW_ACTION_CLASS} onClick={() => onDeactivate(row)} aria-label={t('deactivateAria', { name: row.name })}>
          {t('deactivate')}
        </button>
      ) : null}
    </span>
  );
}

function NameCell({ row }: { readonly row: UserRow }): React.JSX.Element {
  return (
    <span className="grid">
      <span>{row.name}</span>
      {row.email ? <span className="mono text-xs text-[var(--muted-foreground)]">{row.email}</span> : null}
    </span>
  );
}

function useUserColumns<TUser extends UserRow>(actions: UserActions<TUser>, consentLinks: boolean): ReadonlyArray<TableColumn<TUser>> {
  const t = useT('admin.users');
  const columns: TableColumn<TUser>[] = [
    { key: 'name', header: t('columns.name'), render: (row) => <NameCell row={row} /> },
    { key: 'role', header: t('columns.role'), render: (row) => <RoleChips row={row} /> },
    { key: 'status', header: t('columns.status'), render: (row) => <StatusStamp row={row} /> },
    { key: 'links', header: t('columns.links'), render: (row) => <LinkChips row={row} /> },
  ];
  if (actions.onEdit || actions.onDeactivate || actions.onActivate || consentLinks) {
    columns.push({ key: 'actions', header: t('columns.actions'), render: (row) => <RowActions row={row} consentLinks={consentLinks} {...actions} /> });
  }
  return columns;
}

/** Admin user list (FR-015). Presentational: the panel owns the query, the paging state and the dialogs. */
export function UsersTable<TUser extends UserRow>({ rows, meta, onPage, consentLinks = false, onEdit, onDeactivate, onActivate }: UsersTableProps<TUser>): React.JSX.Element {
  const t = useT('admin.users');
  const columns = useUserColumns({ onEdit, onDeactivate, onActivate }, consentLinks);
  return <PaginatedTable<TUser> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
