'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';

/** Shown for the moment between the 201 and the arrival on the appointment page (and if that navigation stalls). */
export function BookingSuccess({ appointmentId }: { readonly appointmentId: string }): ReactNode {
  const t = useT('booking');
  return (
    <Card radius="panel" padding="lg" role="status" data-testid="booking-success">
      <h2 className="text-[22px] font-bold">{t('successTitle')}</h2>
      <p className="mt-2 text-[15px] text-muted-foreground">{t('successLead')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/appointments/${encodeURIComponent(appointmentId)}`} className={buttonVariants({ variant: 'primary' })}>
          {t('toAppointment')}
        </Link>
        <Link href="/appointments" className={buttonVariants({ variant: 'secondary' })}>
          {t('toAppointments')}
        </Link>
      </div>
    </Card>
  );
}
