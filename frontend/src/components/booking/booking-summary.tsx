'use client';

import type { ReactNode } from 'react';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import { Card } from '@/components/ui/card';
import { formatClinicDateTime } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import type { BookingDraft } from '@/store/use-booking-draft-store';
import { slotDurationMin } from './slot-time';

interface BookingSummaryProps {
  readonly draft: Pick<BookingDraft, 'step' | 'serviceId' | 'doctorId' | 'slotStart' | 'slotEnd'>;
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * "Ваша запись": what the draft holds so far, beside the first three steps. It reads the draft store and the catalogue
 * queries the steps already run (same keys, so nothing is requested twice). The confirmation step has its own summary.
 */
export function BookingSummary({ draft }: BookingSummaryProps): ReactNode {
  const t = useT('booking');
  const locale = useUiStore((state) => state.locale);
  const service = useService(draft.serviceId);
  const doctor = useDoctor(draft.doctorId);
  const hasService: boolean = draft.serviceId !== null;
  const slotMinutes: number = draft.slotStart === null || draft.slotEnd === null ? 0 : slotDurationMin({ start: draft.slotStart, end: draft.slotEnd });
  const minutes: number = slotMinutes > 0 ? slotMinutes : (service.data?.defaultDurationMin ?? 0);
  const muted = 'text-base text-muted-foreground';
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="booking-summary-title" data-testid="booking-draft-summary" className="flex flex-col gap-4">
      <h2 id="booking-summary-title" className="text-lg font-bold">{t('summaryTitle')}</h2>
      <dl className="flex flex-col gap-3.5">
        <Row label={t('summaryService')}>
          {hasService ? <span className="text-base font-semibold">{service.data?.name ?? '…'}</span> : <span className={muted}>{draft.step === 1 ? t('summaryNone') : t('serviceBySchedule')}</span>}
        </Row>
        <Row label={t('summaryDoctor')}>
          {draft.doctorId === null ? <span className={muted}>{t('summaryNone')}</span> : <span className="text-base font-semibold">{doctor.data?.name ?? '…'}</span>}
        </Row>
        <Row label={t('summaryTime')}>
          {draft.slotStart === null ? <span className={muted}>—</span> : <span className="mono text-[15px] font-medium">{formatClinicDateTime(draft.slotStart, locale)}</span>}
        </Row>
        <Row label={t('summaryDuration')}>
          {minutes > 0 ? <span className="mono text-[15px] font-medium">{t('slotMinutes', { minutes })}</span> : <span className={muted}>—</span>}
        </Row>
      </dl>
      <p className="text-[13px] leading-normal text-muted-foreground">{t('draftNote')}</p>
    </Card>
  );
}
