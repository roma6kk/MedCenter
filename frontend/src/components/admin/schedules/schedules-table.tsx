'use client';

import { Ban, CalendarPlus, LayoutGrid, Pencil, Trash2 } from 'lucide-react';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { AdminSchedule, WeekDay } from './schedule-types';
import { formatDateKey } from '@/lib/clinic-time';
import { describeWindows } from '@/lib/schedule-windows-text';
import { labelOf, type SchedulePickers } from './use-schedule-pickers';

export interface ScheduleHandlers {
  readonly onSlots: (schedule: AdminSchedule) => void;
  readonly onGenerate: (schedule: AdminSchedule) => void;
  readonly onEdit: (schedule: AdminSchedule) => void;
  readonly onDelete: (schedule: AdminSchedule) => void;
}

interface SchedulesTableProps extends ScheduleHandlers {
  readonly rows: ReadonlyArray<AdminSchedule>;
  readonly meta: PageMeta;
  readonly onPage: (page: number) => void;
  readonly pickers: SchedulePickers;
}

/** `Иванова Мария · Кабинет 101`: who and where, for the dialogs opened from a row. */
export function describeSchedule(schedule: AdminSchedule, pickers: SchedulePickers): string {
  return [labelOf(pickers.allDoctors, schedule.practitionerRoleId), labelOf(pickers.rooms, schedule.roomId)].join(' · ');
}

/**
 * D3: «Сгенерировать слоты» is the frequent action, so it stays a visible secondary button (only for an active schedule);
 * the rest goes into the «⋯» menu, edit first and the destructive delete last.
 */
function ScheduleActions({ schedule, label, onSlots, onGenerate, onEdit, onDelete }: ScheduleHandlers & { readonly schedule: AdminSchedule; readonly label: string }): React.JSX.Element {
  const t = useT('admin.schedules');
  const tCommon = useT('admin.common');
  const items: MenuItem[] = [];
  if (schedule.isActive) items.push({ key: 'edit', label: t('actions.edit'), icon: Pencil, onSelect: () => onEdit(schedule) });
  items.push({ key: 'slots', label: t('actions.slots'), icon: LayoutGrid, onSelect: () => onSlots(schedule) });
  items.push({ key: 'delete', label: t('actions.delete'), icon: Trash2, destructive: true, onSelect: () => onDelete(schedule) });
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {schedule.isActive ? (
        <button type="button" className={cn(buttonVariants({ variant: 'secondary' }), 'whitespace-nowrap')} onClick={() => onGenerate(schedule)} aria-label={t('actions.generateAria', { label })}>
          <CalendarPlus aria-hidden="true" className="size-4" />
          {t('actions.generate')}
        </button>
      ) : null}
      <DropdownMenu label={tCommon('rowActions', { name: label })} items={items} />
    </span>
  );
}

/**
 * The weekly windows in words, one line per group of days with the same hours (`Пн–Пт 09:00–13:00`): a schedule of five working
 * days is one line, not five. Spans only: the mobile card puts a cell inside a `<p>`.
 */
function WindowsCell({ schedule, dayLabel, duration }: { readonly schedule: AdminSchedule; readonly dayLabel: (day: WeekDay) => string; readonly duration: string | undefined }): React.JSX.Element {
  const groups = describeWindows(schedule.windows, dayLabel);
  if (groups.length === 0) return <>—</>;
  return (
    <span className="grid gap-0.5">
      {groups.map((group) => (
        <span key={`${group.days}-${group.times}`} className="whitespace-nowrap">
          {group.days} {group.times}
        </span>
      ))}
      {duration === undefined ? null : <span className="whitespace-nowrap text-xs text-muted-foreground">{duration}</span>}
    </span>
  );
}

/** `26.10 – 08.11.2026`: the year is written once when both ends are in it, so the column stays on one line. */
function horizonOf(schedule: AdminSchedule): string {
  if (schedule.horizonFrom === undefined || schedule.horizonTo === undefined) return '—';
  const from: string = formatDateKey(schedule.horizonFrom, 'numeric');
  const to: string = formatDateKey(schedule.horizonTo, 'numeric');
  return from.slice(6) === to.slice(6) ? `${from.slice(0, 5)} – ${to}` : `${from} – ${to}`;
}

function useScheduleColumns(pickers: SchedulePickers, handlers: ScheduleHandlers): ReadonlyArray<TableColumn<AdminSchedule>> {
  const t = useT('admin.schedules');
  return [
    { key: 'doctor', header: t('columns.doctor'), render: (row) => labelOf(pickers.allDoctors, row.practitionerRoleId), truncate: 'max-w-[13rem]' },
    { key: 'room', header: t('columns.room'), render: (row) => labelOf(pickers.rooms, row.roomId), truncate: 'max-w-[10rem]' },
    { key: 'service', header: t('columns.service'), render: (row) => labelOf(pickers.services, row.serviceId), truncate: 'max-w-[12rem]' },
    { key: 'horizon', header: t('columns.horizon'), render: (row) => <span className="tabular-nums whitespace-nowrap text-xs">{horizonOf(row)}</span> },
    {
      key: 'windows',
      header: t('columns.windows'),
      render: (row) => <WindowsCell schedule={row} dayLabel={(day) => t(`days.${day}`)} duration={row.slotDurationMin === undefined ? undefined : t('slotOf', { minutes: row.slotDurationMin })} />,
    },
    { key: 'status', header: t('columns.status'), render: (row) => row.isActive ? <StampBadge status="active">{t('active')}</StampBadge> : <StampBadge status="cancelled" tone="neutral" icon={Ban}>{t('inactive')}</StampBadge> },
    { key: 'actions', header: t('columns.actions'), render: (row) => <ScheduleActions schedule={row} label={describeSchedule(row, pickers)} {...handlers} /> },
  ];
}

/** Schedule list (FR-020): doctor, room, service, horizon, weekly windows, status; slots / generate / edit / delete per row. */
export function SchedulesTable({ rows, meta, onPage, pickers, ...handlers }: SchedulesTableProps): React.JSX.Element {
  const t = useT('admin.schedules');
  const columns = useScheduleColumns(pickers, handlers);
  return <PaginatedTable<AdminSchedule> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
