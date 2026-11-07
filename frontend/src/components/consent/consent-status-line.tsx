'use client';

import type { ReactNode } from 'react';
import { ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { consentDayOf, consentStateOf, type ConsentState } from './consent-types';
import { usePatientConsent } from './use-consent';

interface ConsentStatusLineProps {
  readonly patientId: string;
  readonly onManage?: () => void;
}

function numericDate(value: string): string {
  return formatDateKey(consentDayOf(value), 'numeric');
}

export function ConsentStatusLine({ patientId, onManage }: ConsentStatusLineProps): ReactNode {
  const t = useT('consent.line');
  const consent = usePatientConsent(patientId);
  if (consent.data === undefined) return consent.isPending ? <Skeleton className="h-6 w-56 rounded-full" /> : null;
  const state: ConsentState = consentStateOf(consent.data);
  const since: string | undefined = consent.data.active?.signedAt;
  const isActive: boolean = state === 'active';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <Badge tone={isActive ? 'success' : 'warning'} icon={isActive ? ShieldCheck : state === 'none' ? ShieldAlert : ShieldOff} data-testid={`consent-line-${state}`}>
        {state === 'active' && since !== undefined ? t('active', { date: numericDate(since) }) : t(state)}
      </Badge>
      {onManage === undefined ? null : (
        <button type="button" onClick={onManage} className="inline-flex min-h-[44px] items-center rounded-control text-sm font-semibold text-primary-soft-foreground hover:underline">
          {t('manage')}
        </button>
      )}
    </span>
  );
}
