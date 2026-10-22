'use client';

import type { ReactNode } from 'react';
import { Pill } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CodeChip } from '@/components/feedback/code-chip';
import { hasMessage } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import type { MedicationPrescription, Prescription, ServicePrescription } from '../patient-types';
import { WRAP_TEXT } from '../wrap-text';
import { statusBucket, type StatusBucket } from './prescription-logic';

export const ATC_SYSTEM = 'http://www.whocc.no/atc';

const CHIP_TONE: Readonly<Record<StatusBucket, string>> = {
  active: 'bg-success-soft text-success',
  closed: 'bg-secondary text-muted-foreground',
  other: 'bg-warning-soft text-warning',
};

/** A soft chip whose words carry the status; the tint only reinforces them. */
function StatusChip({ status }: { readonly status: string }): ReactNode {
  const t = useT('patient.prescriptions.status');
  const { locale } = useClinicFormat();
  const known: boolean = hasMessage(locale, `patient.prescriptions.status.${status}`);
  return (
    <span data-testid={`status-${status}`} className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${CHIP_TONE[statusBucket(status)]}`}>
      {known ? t(status) : t('unknown')}
    </span>
  );
}

function CardFooter({ item }: { readonly item: Prescription }): ReactNode {
  const t = useT('patientPrescriptions');
  const format = useClinicFormat();
  return (
    <>
      {item.note ? <p className={`text-sm ${WRAP_TEXT}`}><span className="text-muted-foreground">{t('note')}: </span>{item.note}</p> : null}
      {item.authoredOn ? <p className="text-[13px] text-muted-foreground">{t('authored', { date: format.date(item.authoredOn) })}</p> : null}
    </>
  );
}

function KindLabel({ children }: { readonly children: ReactNode }): ReactNode {
  return <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</span>;
}

export function MedicationCard({ item }: { readonly item: MedicationPrescription }): ReactNode {
  const t = useT('patientPrescriptions');
  return (
    <li className="min-w-0">
      <Card as="article" data-kind="medication" padding="lg" className="flex h-full flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <KindLabel><Pill aria-hidden="true" className="h-4 w-4 text-primary" />{t('medication')}</KindLabel>
          <StatusChip status={item.status} />
        </div>
        <h3 className={`text-[19px] font-bold ${WRAP_TEXT}`}>{item.atcDisplay ?? item.atcCode}</h3>
        <div className="flex flex-col gap-0.5 rounded-control bg-background px-3.5 py-3">
          <span className="text-xs text-muted-foreground">{t('howTo')}</span>
          <span className={`text-[15px] font-semibold ${WRAP_TEXT}`}>{item.dosageText}</span>
        </div>
        <CardFooter item={item} />
        <p className="mt-auto flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>{t('atc')}</span>
          <CodeChip code={item.atcCode} system={ATC_SYSTEM} />
        </p>
      </Card>
    </li>
  );
}

/** A referral or an ordered service has a national-catalogue code and no ATC code, so it gets no ATC chip. */
export function ServiceCard({ item }: { readonly item: ServicePrescription }): ReactNode {
  const t = useT('patientPrescriptions');
  return (
    <li className="min-w-0">
      <Card as="article" data-kind="service" padding="lg" className="flex h-full flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <KindLabel>{t('service')}</KindLabel>
          <StatusChip status={item.status} />
        </div>
        <p className="flex flex-wrap items-baseline gap-2">
          <CodeChip code={item.code} system={item.codeSystem} />
          {item.display ? <span className={`text-[17px] font-bold ${WRAP_TEXT}`}>{item.display}</span> : null}
        </p>
        <CardFooter item={item} />
      </Card>
    </li>
  );
}
