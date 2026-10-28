'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { DeleteScheduleDialog } from './delete-schedule-dialog';
import { ScheduleFormDialog } from './schedule-form-dialog';
import { ScheduleSlotsDialog } from './schedule-slots-dialog';
import type { AdminSchedule } from './schedule-types';
import { SchedulesFilters } from './schedules-filters';
import { describeSchedule, SchedulesTable, type ScheduleHandlers } from './schedules-table';
import { SchedulesWeekPlan } from './schedule-week-plan';
import type { PlanGrouping } from './schedule-week-plan-model';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AdminPageHeader } from '../shared/admin-page-header';
import { CreateButton } from '../shared/create-button';
import { QueryState } from '../shared/query-state';
import { useStepBackWhenPageEmpty } from '../shared/use-step-back-when-page-empty';
import { SlotGenerationDialog } from './slot-generation-dialog';
import { SCHEDULES_WEEK_PAGE_SIZE, useAdminSchedules, type SchedulesFilter } from './use-admin-schedules';
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

type ScheduleView = 'list' | 'week';

interface ViewProps {
  readonly filter: SchedulesFilter;
  readonly pickers: SchedulePickers;
  readonly onFilter: (filter: SchedulesFilter) => void;
}

/** The paged list with the row actions. */
function SchedulesListView({ filter, pickers, onFilter, onSlots, onGenerate, onEdit, onDelete }: ViewProps & ScheduleHandlers): ReactNode {
  const t = useT('admin.schedules');
  const query = useAdminSchedules(filter);
  useStepBackWhenPageEmpty(query.data, filter.page, (page) => onFilter({ ...filter, page }));
  const empty = emptyKeys(filter);
  return (
    <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t(empty.title)} emptyDescription={t(empty.hint)}>
      {(data) => (
        <SchedulesTable rows={data.items} meta={data.meta} pickers={pickers} onPage={(page) => onFilter({ ...filter, page })} onSlots={onSlots} onGenerate={onGenerate} onEdit={onEdit} onDelete={onDelete} />
      )}
    </QueryState>
  );
}

/** The weekly plan of the same schedules (the filters apply): a row per doctor or per room, a column per weekday. */
function SchedulesWeekView({ filter, pickers }: Omit<ViewProps, 'onFilter'>): ReactNode {
  const t = useT('admin.schedules');
  const [grouping, setGrouping] = useState<PlanGrouping>('doctor');
  const query = useAdminSchedules({ ...filter, page: 1 }, SCHEDULES_WEEK_PAGE_SIZE);
  const empty = emptyKeys(filter);
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl<PlanGrouping>
        kind="toggle"
        size="sm"
        label={t('week.groupLabel')}
        options={[
          { value: 'doctor', label: t('week.byDoctor') },
          { value: 'room', label: t('week.byRoom') },
        ]}
        value={grouping}
        onChange={setGrouping}
      />
      <QueryState query={query} isEmpty={(data) => data.items.length === 0} emptyTitle={t(empty.title)} emptyDescription={t(empty.hint)}>
        {(data) => (
          <>
            <SchedulesWeekPlan schedules={data.items} pickers={pickers} grouping={grouping} />
            <p className="mt-1 text-sm text-muted-foreground">{data.meta.totalItems > data.items.length ? t('week.truncated', { count: data.items.length }) : t('week.hint')}</p>
          </>
        )}
      </QueryState>
    </div>
  );
}

/** `/admin/schedules` (FR-020): filters, the schedule list or its week plan, the editor, slot generation, the slot grid and delete. */
export function SchedulesPanel(): ReactNode {
  const t = useT('admin.schedules');
  const [filter, setFilter] = useState<SchedulesFilter>({ page: 1, doctorId: '', active: DEFAULT_ACTIVE });
  const [view, setView] = useState<ScheduleView>('list');
  const { dialog, openCreate, openFor, close } = useScheduleDialogs();
  const pickers = useSchedulePickers();
  return (
    <>
      <AdminPageHeader title={t('title')} description={t('description')} action={<CreateButton label={t('create')} onClick={openCreate} />} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SchedulesFilters filter={filter} pickers={pickers} onChange={setFilter} />
        <SegmentedControl<ScheduleView>
          kind="toggle"
          label={t('view.label')}
          options={[
            { value: 'list', label: t('view.list') },
            { value: 'week', label: t('view.week') },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'list' ? (
        <SchedulesListView filter={filter} pickers={pickers} onFilter={setFilter} onSlots={openFor('slots')} onGenerate={openFor('generate')} onEdit={openFor('edit')} onDelete={openFor('delete')} />
      ) : (
        <SchedulesWeekView filter={filter} pickers={pickers} />
      )}
      <ScheduleDialogs dialog={dialog} pickers={pickers} onClose={close} />
    </>
  );
}
