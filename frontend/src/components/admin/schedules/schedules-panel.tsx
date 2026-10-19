'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { DeleteScheduleDialog } from './delete-schedule-dialog';
import { ScheduleFormDialog } from './schedule-form-dialog';
import { ScheduleSlotsDialog } from './schedule-slots-dialog';
import type { AdminSchedule } from './schedule-types';
import { SchedulesFilters } from './schedules-filters';
import { describeSchedule, SchedulesTable } from './schedules-table';
import { AdminPageHeader } from '../shared/admin-page-header';
import { CreateButton } from '../shared/create-button';
import { QueryState } from '../shared/query-state';
import { useStepBackWhenPageEmpty } from '../shared/use-step-back-when-page-empty';
import { SlotGenerationDialog } from './slot-generation-dialog';
import { useAdminSchedules, type SchedulesFilter } from './use-admin-schedules';
import { useSchedulePickers, type SchedulePickers } from './use-schedule-pickers';

type OpenableDialog = 'edit' | 'slots' | 'generate' | 'delete';

type DialogState = { readonly kind: 'none' } | { readonly kind: 'create' } | { readonly kind: OpenableDialog; readonly schedule: AdminSchedule };

/** The list opens on the active schedules; any other filter value narrows or widens what the admin asked for. */
const DEFAULT_ACTIVE: SchedulesFilter['active'] = 'true';

interface DialogsProps {
  readonly dialog: DialogState;
  readonly pickers: SchedulePickers;
  readonly onClose: () => void;
}

function ScheduleDialogs({ dialog, pickers, onClose }: DialogsProps): ReactNode {
  if (dialog.kind === 'none') return null;
  if (dialog.kind === 'create') return <ScheduleFormDialog onClose={onClose} />;
  const label: string = describeSchedule(dialog.schedule, pickers);
  if (dialog.kind === 'edit') return <ScheduleFormDialog schedule={dialog.schedule} onClose={onClose} />;
  if (dialog.kind === 'slots') return <ScheduleSlotsDialog schedule={dialog.schedule} scheduleLabel={label} onClose={onClose} />;
  if (dialog.kind === 'generate') return <SlotGenerationDialog schedule={dialog.schedule} scheduleLabel={label} onClose={onClose} />;
  return <DeleteScheduleDialog schedule={dialog.schedule} scheduleLabel={label} onClose={onClose} />;
}

interface ScheduleDialogControls {
  readonly dialog: DialogState;
  readonly openCreate: () => void;
  readonly openFor: (kind: OpenableDialog) => (schedule: AdminSchedule) => void;
  readonly close: () => void;
}

function useScheduleDialogs(): ScheduleDialogControls {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  return {
    dialog,
    openCreate: () => setDialog({ kind: 'create' }),
    openFor: (kind) => (schedule) => setDialog({ kind, schedule }),
    close: () => setDialog({ kind: 'none' }),
  };
}

/** The empty-state texts: a list narrowed by a filter says so, an empty default list invites to create the first schedule. */
function emptyKeys(filter: SchedulesFilter): { readonly title: string; readonly hint: string } {
  const isFiltered: boolean = filter.doctorId !== '' || filter.active !== DEFAULT_ACTIVE;
  return isFiltered ? { title: 'emptyFiltered', hint: 'emptyFilteredHint' } : { title: 'empty', hint: 'emptyHint' };
}

/** `/admin/schedules` (FR-020): filters, the schedule list, the editor, slot generation, the slot grid and delete. */
export function SchedulesPanel(): ReactNode {
  const t = useT('admin.schedules');
  const [filter, setFilter] = useState<SchedulesFilter>({ page: 1, doctorId: '', active: DEFAULT_ACTIVE });
  const { dialog, openCreate, openFor, close } = useScheduleDialogs();
  const pickers = useSchedulePickers();
  const query = useAdminSchedules(filter);
  useStepBackWhenPageEmpty(query.data, filter.page, (page) => setFilter({ ...filter, page }));
  const empty = emptyKeys(filter);
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={openCreate} />} />
      <SchedulesFilters filter={filter} pickers={pickers} onChange={setFilter} />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t(empty.title)} emptyDescription={t(empty.hint)}>
        {(data) => (
          <SchedulesTable
            rows={data.items}
            meta={data.meta}
            pickers={pickers}
            onPage={(page) => setFilter({ ...filter, page })}
            onSlots={openFor('slots')}
            onGenerate={openFor('generate')}
            onEdit={openFor('edit')}
            onDelete={openFor('delete')}
          />
        )}
      </QueryState>
      <ScheduleDialogs dialog={dialog} pickers={pickers} onClose={close} />
    </>
  );
}
