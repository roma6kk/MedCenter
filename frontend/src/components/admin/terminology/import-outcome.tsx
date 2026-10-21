'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { FormProblem } from '../shared/admin-problem';
import { detailCodeOf, problemOf } from '../shared/problem-of';
import type { FormBanner } from '../shared/use-form-banner';
import { useUiStore } from '@/store/use-ui-store';
import type { ImportAccepted } from './terminology-types';

const OUTCOME_CLASS = 'mt-3 rounded-control border p-3 text-sm';

function Accepted({ accepted }: { readonly accepted: ImportAccepted }): ReactNode {
  const t = useT('admin.terminology.import');
  const locale = useUiStore((state) => state.locale);
  return (
    <div role="status" data-testid="import-accepted" className={`${OUTCOME_CLASS} border-transparent bg-success-soft`}>
      <p className="font-semibold">{t('accepted')}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">{t('acceptedDetail', { version: accepted.snapshotVersion, time: formatClinicDateTime(accepted.acceptedAt, locale) })}</p>
      <p className="mt-1">
        {t('importId')} <code className="mono text-xs">{accepted.importId}</code>
      </p>
    </div>
  );
}

function AlreadyRunning(): ReactNode {
  const t = useT('admin.terminology.import');
  return (
    <div role="status" data-testid="import-running" className={`${OUTCOME_CLASS} border-transparent bg-warning-soft`}>
      <p className="font-semibold">{t('alreadyRunning')}</p>
      <p className="mt-1 text-[var(--muted-foreground)]">{t('alreadyRunningHint')}</p>
    </div>
  );
}

interface ImportOutcomeProps {
  readonly accepted: ImportAccepted | undefined;
  /** The failure of the last attempt that no field took (see `useFormBanner`); `null` when it sits at the version field. */
  readonly banner: FormBanner | null;
}

/**
 * What the last import attempt came to: accepted (202), already running (409 `IMPORT_RUNNING` only — any other 409 is an
 * ordinary conflict and gets the problem banner), or the problem banner for anything else.
 */
export function ImportOutcome({ accepted, banner }: ImportOutcomeProps): ReactNode {
  if (banner !== null) {
    return detailCodeOf(problemOf(banner.error)) === 'IMPORT_RUNNING' ? <AlreadyRunning /> : <FormProblem banner={banner} />;
  }
  return accepted === undefined ? null : <Accepted accepted={accepted} />;
}
