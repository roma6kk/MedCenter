'use client';

import { cn } from '@/lib/ui/cn';
import { PaginatedTable, type PageMeta, type TableColumn } from '@/components/data-display/paginated-table';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import { sortWindows } from './schedule-windows';
import type { AdminSchedule, WeekDay } from './schedule-types';
import { formatDateKey } from '@/lib/clinic-time';
import { ROW_ACTION_CLASS } from '../shared/admin-styles';
import { labelOf, type SchedulePickers } from './use-schedule-pickers';

/** The row actions may wrap: «Сгенерировать слоты» on one line pushes the column past the table edge at 1280 px. */
const ACTION_CLASS: string = cn(ROW_ACTION_CLASS, 'whitespace-normal');

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

/** `Иванова Мария · Кабинет 101 (101)`: who and where, for the dialogs opened from a row. */
export function describeSchedule(schedule: AdminSchedule, pickers: SchedulePickers): string {
  return [labelOf(pickers.allDoctors, schedule.practitionerRoleId), labelOf(pickers.rooms, schedule.roomId)].join(' · ');
}

function ScheduleActions({ schedule, label, onSlots, onGenerate, onEdit, onDelete }: ScheduleHandlers & { readonly schedule: AdminSchedule; readonly label: string }): React.JSX.Element {
  const t = useT('admin.schedules');
  return (
    <span className="flex min-w-[9rem] flex-col items-start">
      <button type="button" className={ACTION_CLASS} onClick={() => onSlots(schedule)} aria-label={t('actions.slotsAria', { label })}>{t('actions.slots')}</button>
      {schedule.isActive ? <button type="button" className={ACTION_CLASS} onClick={() => onGenerate(schedule)} aria-label={t('actions.generateAria', { label })}>{t('actions.generate')}</button> : null}
      {schedule.isActive ? <button type="button" className={ACTION_CLASS} onClick={() => onEdit(schedule)} aria-label={t('actions.editAria', { label })}>{t('actions.edit')}</button> : null}
      <button type="button" className={ACTION_CLASS} onClick={() => onDelete(schedule)} aria-label={t('actions.deleteAria', { label })}>{t('actions.delete')}</button>
    </span>
  );
}

/** One line per window (`Пн 09:00–13:00`), so a time never breaks across lines in the narrow column. Spans only: the mobile card puts a cell inside a `<p>`. */
function WindowsCell({ schedule, dayLabel }: { readonly schedule: AdminSchedule; readonly dayLabel: (day: WeekDay) => string }): React.JSX.Element {
  if (schedule.windows.length === 0) return <>—</>;
  return (
    <span className="grid gap-0.5">
      {sortWindows(schedule.windows).map((window) => (
        <span key={`${window.dayOfWeek}-${window.startTime}`} className="whitespace-nowrap">
          {dayLabel(window.dayOfWeek)} {window.startTime}–{window.endTime}
        </span>
      ))}
    </span>
  );
}

function horizonOf(schedule: AdminSchedule): string {
  if (schedule.horizonFrom === undefined || schedule.horizonTo === undefined) return '—';
  return `${formatDateKey(schedule.horizonFrom, 'numeric')} – ${formatDateKey(schedule.horizonTo, 'numeric')}`;
}

function useScheduleColumns(pickers: SchedulePickers, handlers: ScheduleHandlers): ReadonlyArray<TableColumn<AdminSchedule>> {
  const t = useT('admin.schedules');
  return [
    { key: 'doctor', header: t('columns.doctor'), render: (row) => labelOf(pickers.allDoctors, row.practitionerRoleId) },
    { key: 'room', header: t('columns.room'), render: (row) => labelOf(pickers.rooms, row.roomId) },
    { key: 'service', header: t('columns.service'), render: (row) => labelOf(pickers.services, row.serviceId) },
    { key: 'horizon', header: t('columns.horizon'), render: (row) => <span className="mono text-xs">{horizonOf(row)}</span> },
    { key: 'windows', header: t('columns.windows'), render: (row) => <WindowsCell schedule={row} dayLabel={(day) => t(`days.${day}`)} /> },
    { key: 'duration', header: t('columns.duration'), render: (row) => (row.slotDurationMin === undefined ? '—' : t('minutes', { count: row.slotDurationMin })) },
    { key: 'status', header: t('columns.status'), render: (row) => <StampBadge status={row.isActive ? 'active' : 'cancelled'}>{row.isActive ? t('active') : t('inactive')}</StampBadge> },
    { key: 'actions', header: t('columns.actions'), render: (row) => <ScheduleActions schedule={row} label={describeSchedule(row, pickers)} {...handlers} /> },
  ];
}

/** Schedule list (FR-020): doctor, room, service, horizon, weekly windows, status; slots / generate / edit / delete per row. */
export function SchedulesTable({ rows, meta, onPage, pickers, ...handlers }: SchedulesTableProps): React.JSX.Element {
  const t = useT('admin.schedules');
  const columns = useScheduleColumns(pickers, handlers);
  return <PaginatedTable<AdminSchedule> caption={t('title')} rowKey={(row) => row.id} meta={meta} onPage={onPage} rows={rows} columns={columns} />;
}
