'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';

interface EncounterDraftNoticeProps {
  /** ISO time the restored draft was saved. */
  readonly savedAt: string;
  readonly onDismiss: () => void;
  readonly onStartOver: () => void;
}

/** «Восстановлен черновик от …»: the form was filled from what this browser kept; the doctor can dismiss the note or start over. */
export function EncounterDraftNotice({ savedAt, onDismiss, onStartOver }: EncounterDraftNoticeProps): ReactNode {
  const t = useT('doctor.encounter');
  const { dateTime } = useClinicFormat();
  return (
    <div role="status" data-testid="draft-restored" className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-info bg-info-soft px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <strong>{t('restoredNotice', { when: dateTime(savedAt) })}</strong> {t('restoredHint')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onStartOver}>{t('restoredStartOver')}</Button>
        <Button variant="ghost" onClick={onDismiss}>{t('restoredDismiss')}</Button>
      </div>
    </div>
  );
}
