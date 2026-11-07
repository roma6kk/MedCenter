'use client';

import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { FormField, INPUT_CLASS } from '@/components/patient/form-field';
import { EMERGENCY_REASON_MAX, EMERGENCY_REASON_MIN } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';

interface ConsentRequiredNoticeProps {
  readonly action: 'open' | 'complete';
  readonly patientId: string;
  readonly isPending: boolean;
  readonly onEmergency: (reason: string) => void;
}

function reasonProblem(reason: string): 'reasonTooShort' | 'reasonTooLong' | null {
  if (reason.length < EMERGENCY_REASON_MIN) return 'reasonTooShort';
  return reason.length > EMERGENCY_REASON_MAX ? 'reasonTooLong' : null;
}

function EmergencyForm({ action, isPending, onEmergency }: Omit<ConsentRequiredNoticeProps, 'patientId'>): ReactNode {
  const t = useT('consent.required');
  const headingId: string = useId();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const problem = reasonProblem(reason.trim());
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setTouched(true);
    if (isPending || problem !== null) return;
    onEmergency(reason.trim());
  };
  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby={headingId} className="mt-4 border-t border-border pt-4">
      <h3 id={headingId} className="font-semibold">{t('emergencyTitle')}</h3>
      <p className="mt-1 text-sm">{t('emergencyHint')}</p>
      <FormField id={`${headingId}-reason`} label={t('reason')} hint={t('reasonHint')} error={touched && problem !== null ? t(problem) : undefined}>
        {(control) => <textarea {...control} rows={3} aria-required="true" value={reason} onChange={(event) => setReason(event.target.value)} className={INPUT_CLASS} />}
      </FormField>
      <Button type="submit" variant="secondary" aria-disabled={isPending ? true : undefined} aria-busy={isPending} className="mt-3">
        {isPending ? t('sending') : t(action === 'open' ? 'openEmergency' : 'completeEmergency')}
      </Button>
    </form>
  );
}

export function ConsentRequiredNotice({ action, patientId, isPending, onEmergency }: ConsentRequiredNoticeProps): ReactNode {
  const t = useT('consent.required');
  return (
    <div data-testid="consent-required" className="rounded-card border border-warning bg-warning-soft p-4">
      <div role="alert">
        <p className="font-semibold">{t('title')}</p>
        <p className="mt-1 text-sm">{t(action === 'open' ? 'openLead' : 'completeLead')}</p>
        <p className="mt-1 text-sm">{t('how')}</p>
      </div>
      <Link href={`/patients/${encodeURIComponent(patientId)}#consent`} className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}>{t('record')}</Link>
      <EmergencyForm action={action} isPending={isPending} onEmergency={onEmergency} />
    </div>
  );
}
