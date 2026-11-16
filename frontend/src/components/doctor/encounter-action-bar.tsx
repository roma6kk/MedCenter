'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Check, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { DraftStatus } from './use-encounter-draft';

function DraftStatusLine({ status }: { readonly status: DraftStatus }): ReactNode {
  const t = useT('doctor.encounter');
  const { time } = useClinicFormat();
  const tone: string = status.kind === 'unavailable' ? 'text-warning' : 'text-muted-foreground';
  const line: ReactNode =
    status.kind === 'saved' ? <><Check aria-hidden="true" className="size-4 shrink-0 text-success" />{t('draftSaved', { time: time(status.savedAt) })}</> :
    status.kind === 'pending' ? <><Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />{t('draftPending')}</> :
    status.kind === 'unavailable' ? <><AlertTriangle aria-hidden="true" className="size-4 shrink-0" />{t('draftUnavailable')}</> :
    t('draftNone');
  return <p role="status" aria-live="polite" className={cn('flex min-w-0 basis-full items-center gap-2 text-sm sm:min-w-[15rem] sm:basis-auto sm:flex-1', tone)}>{line}</p>;
}

interface EncounterActionBarProps {
  readonly status: DraftStatus;
  readonly onSaveDraft: () => void;
  readonly isCompleting: boolean;
  readonly onCancelEncounter: () => void;
}

export function EncounterActionBar({ status, onSaveDraft, isCompleting, onCancelEncounter }: EncounterActionBarProps): ReactNode {
  const t = useT('doctor.encounter');
  return (
    <Card as="section" aria-label={t('actionsLabel')} padding="none" className="no-print sticky bottom-2 z-20 mt-4 flex flex-wrap items-center justify-end gap-x-2 gap-y-2 px-3 py-3 shadow-elev-2 sm:gap-x-4 sm:px-4">
      <DraftStatusLine status={status} />
      <Button variant="quiet-danger" onClick={onCancelEncounter} className="whitespace-nowrap px-2 sm:px-4">{t('cancel')}</Button>
      <Button variant="secondary" onClick={onSaveDraft} className="flex-1 whitespace-nowrap px-2 sm:flex-none sm:px-4">
        <Save aria-hidden="true" className="hidden size-4 sm:block" />
        {t('saveDraft')}
      </Button>
      <button type="submit" aria-disabled={isCompleting} aria-busy={isCompleting} className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'flex-1 whitespace-nowrap px-2 sm:min-h-[52px] sm:flex-none sm:px-6 sm:text-base')}>
        {isCompleting ? t('completing') : t('complete')}
      </button>
    </Card>
  );
}
