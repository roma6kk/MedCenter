'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './admin-styles';
import { SubmitButton } from './submit-button';

interface FormActionsProps {
  readonly submitLabel: string;
  readonly isPending: boolean;
  readonly onCancel: () => void;
  readonly error?: unknown;
}

export function FormActions({ submitLabel, isPending, onCancel, error }: FormActionsProps): ReactNode {
  const t = useT('common');
  const tAdmin = useT('admin.common');
  return (
    <div className="mt-5">
      <p className="text-xs text-[var(--muted-foreground)]">{tAdmin('requiredNote')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
          {t('cancel')}
        </button>
        <SubmitButton label={submitLabel} pendingLabel={tAdmin('saving')} isPending={isPending} error={error} />
      </div>
    </div>
  );
}
