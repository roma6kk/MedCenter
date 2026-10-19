'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { AdminSchedule } from './schedule-types';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { useDeleteSchedule } from './use-admin-schedules';

interface DeleteScheduleDialogProps {
  readonly schedule: AdminSchedule;
  readonly scheduleLabel: string;
  readonly onClose: () => void;
}

/**
 * Delete a schedule (api-designer-spec §5.2.4). With slots it answers 409 `SCHEDULE_IN_USE`; «удалить свободные слоты»
 * (`cascade: true`) removes the free ones, busy slots protect the schedule either way.
 */
export function DeleteScheduleDialog({ schedule, scheduleLabel, onClose }: DeleteScheduleDialogProps): ReactNode {
  const t = useT('admin.schedules');
  const [cascade, setCascade] = useState(false);
  const mutation = useDeleteSchedule();
  return (
    <ConfirmDialog
      title={t('deleteTitle')}
      message={t('deleteMessage', { label: scheduleLabel })}
      confirmLabel={t('actions.delete')}
      isPending={mutation.isPending}
      error={mutation.error ?? undefined}
      onConfirm={() => mutation.mutate({ id: schedule.id, cascade }, { onSuccess: onClose })}
      onCancel={onClose}
    >
      <label className="mt-3 flex min-h-[44px] items-start gap-2 py-2 text-sm">
        <input type="checkbox" checked={cascade} onChange={(event) => setCascade(event.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          {t('cascadeLabel')}
          <span className="block text-xs text-[var(--muted-foreground)]">{t('cascadeHint')}</span>
        </span>
      </label>
    </ConfirmDialog>
  );
}
