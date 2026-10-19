'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';

/** Shown for the moment between the 201 and the arrival on the appointment page (and if that navigation stalls). */
export function BookingSuccess({ appointmentId }: { readonly appointmentId: string }): ReactNode {
  const t = useT('booking');
  return (
    <div role="status" data-testid="booking-success">
      <h2 className="serif text-xl font-semibold">{t('successTitle')}</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t('successLead')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/appointments/${encodeURIComponent(appointmentId)}`} className="inline-flex min-h-[44px] items-center rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">
          {t('toAppointment')}
        </Link>
        <Link href="/appointments" className="inline-flex min-h-[44px] items-center rounded-[6px] border border-[var(--border)] px-4 py-2">
          {t('toAppointments')}
        </Link>
      </div>
    </div>
  );
}
