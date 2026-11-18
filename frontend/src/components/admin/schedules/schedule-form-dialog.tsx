'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { ScheduleEditor } from './schedule-editor';
import type { AdminSchedule } from './schedule-types';
import { AdminProblem } from '../shared/admin-problem';
import { Dialog } from '@/components/ui/dialog';
import { TableSkeletonFallback } from '../shared/table-skeleton-fallback';
import { useSchedulePickers } from './use-schedule-pickers';

interface ScheduleFormDialogProps {
  readonly schedule?: AdminSchedule;
  readonly onClose: () => void;
}

export function ScheduleFormDialog({ schedule, onClose }: ScheduleFormDialogProps): ReactNode {
  const t = useT('admin.schedules');
  const pickers = useSchedulePickers();
  return (
    <Dialog title={schedule === undefined ? t('createTitle') : t('editTitle')} onClose={onClose} size="lg">
      {pickers.isPending ? <TableSkeletonFallback /> : null}
      {pickers.error !== null ? <div className="mt-3"><AdminProblem error={pickers.error} /></div> : null}
      {pickers.isPending || (pickers.error !== null && schedule === undefined) ? null : <ScheduleEditor {...(schedule === undefined ? {} : { schedule })} pickers={pickers} onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}
