'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useT } from '@/lib/i18n/use-t';
import type { AdminSchedule } from './schedule-types';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { useDeleteSchedule } from './use-admin-schedules';

interface DeleteScheduleDialogProps {
  readonly schedule: AdminSchedule;
  readonly scheduleLabel: string;
  readonly onClose: () => void;
}

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
      <Checkbox checked={cascade} onChange={(event) => setCascade(event.target.checked)} wrapperClassName="mt-3 items-start">
        <span>
          {t('cascadeLabel')}
          <span className="block text-sm text-muted-foreground">{t('cascadeHint')}</span>
        </span>
      </Checkbox>
    </ConfirmDialog>
  );
}
