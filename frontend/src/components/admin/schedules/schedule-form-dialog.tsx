'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { ScheduleEditor } from './schedule-editor';
import type { AdminSchedule } from './schedule-types';
import { AdminProblem } from '../shared/admin-problem';
import { Modal } from '../shared/modal';
import { TableSkeletonFallback } from '../shared/table-skeleton-fallback';
import { useSchedulePickers } from './use-schedule-pickers';

interface ScheduleFormDialogProps {
  readonly schedule?: AdminSchedule;
  readonly onClose: () => void;
}

/**
 * Create / edit dialog of a schedule: waits for the doctor, room and service lists the editor picks from. When they fail, a new
 * schedule cannot be made (nothing to pick), but an existing one can still be edited: its actors are only shown as text.
 */
export function ScheduleFormDialog({ schedule, onClose }: ScheduleFormDialogProps): ReactNode {
  const t = useT('admin.schedules');
  const pickers = useSchedulePickers();
  return (
    <Modal title={schedule === undefined ? t('createTitle') : t('editTitle')} onClose={onClose} size="lg">
      {pickers.isPending ? <TableSkeletonFallback /> : null}
      {pickers.error !== null ? <div className="mt-3"><AdminProblem error={pickers.error} /></div> : null}
      {pickers.isPending || (pickers.error !== null && schedule === undefined) ? null : <ScheduleEditor {...(schedule === undefined ? {} : { schedule })} pickers={pickers} onDone={onClose} onCancel={onClose} />}
    </Modal>
  );
}
