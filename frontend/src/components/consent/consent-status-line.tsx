'use client';

import type { ReactNode } from 'react';
import { ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { clinicDayOf, formatDateKey, isDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { consentStateOf, type ConsentState } from './consent-types';
import { usePatientConsent } from './use-consent';

interface ConsentStatusLineProps {
  readonly patientId: string;
  /** Reveals the consent management of the page; without it the line is the badge alone (the encounter screen). */
  readonly onManage?: () => void;
}

function numericDate(value: string): string {
  return formatDateKey(isDateKey(value) ? value : clinicDayOf(value), 'numeric');
}

/**
 * The consent of one patient as a single compact line for the head of a page (A1): a badge that says where it stands
 * (and since when, if it is in force) and, when the page can, the way to its management. Quiet while loading and when the
 * consent cannot be read: the management section reports a failed read in full.
 */
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
