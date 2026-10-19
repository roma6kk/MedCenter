'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { ScheduleSlotGrid } from './schedule-slot-grid';
import type { AdminSchedule } from './schedule-types';
import { SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { Modal } from '../shared/modal';

interface ScheduleSlotsDialogProps {
  readonly schedule: AdminSchedule;
  readonly scheduleLabel?: string;
  readonly onClose: () => void;
}

export function ScheduleSlotsDialog({ schedule, scheduleLabel, onClose }: ScheduleSlotsDialogProps): ReactNode {
  const t = useT('admin.slots');
  return (
    <Modal title={t('grid.title')} onClose={onClose} size="lg">
      {scheduleLabel ? <p className="text-sm text-[var(--muted-foreground)]">{scheduleLabel}</p> : null}
      <ScheduleSlotGrid schedule={schedule} />
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
          {t('grid.close')}
        </button>
      </div>
    </Modal>
  );
}
