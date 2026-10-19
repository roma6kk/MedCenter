'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './admin-styles';
import { SubmitButton } from './submit-button';

interface FormActionsProps {
  readonly submitLabel: string;
  readonly isPending: boolean;
  readonly onCancel: () => void;
  /** The failure of the last submit: a 429 keeps the submit closed until its `Retry-After` has passed (frontend-design-spec §5.4). */
  readonly error?: unknown;
}

/** «Отмена» + the submit button of a dialog form, with the note about the asterisk (WCAG 3.3.2). */
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
