'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import type { ActiveCounts } from './prescription-logic';

function Counter({ value, label, tone }: { readonly value: number; readonly label: string; readonly tone: string }): ReactNode {
  return (
    <div className={`flex-1 rounded-card p-3.5 ${tone}`}>
      <div className="text-[28px] font-bold leading-tight">{value}</div>
      <div className="text-[13px]">{label}</div>
    </div>
  );
}

/** Counters of the loaded page only (the response carries no per-status total), the help card and the printout note. */
export function PrescriptionSide({ counts }: { readonly counts: ActiveCounts }): ReactNode {
  const t = useT('patientPrescriptions');
  return (
    <aside className="flex min-w-0 flex-col gap-4 lg:w-[320px] lg:shrink-0">
      <Card as="section" radius="panel" padding="lg" aria-labelledby="rx-sum" className="no-print flex flex-col gap-3">
        <h2 id="rx-sum" className="text-lg font-bold">{t('summaryTitle')}</h2>
        <p className="text-[13px] text-muted-foreground">{t('summaryScope')}</p>
        <div className="flex gap-3">
          <Counter value={counts.medications} label={t('medicationsCount', { count: counts.medications })} tone="bg-primary-soft text-primary-soft-foreground" />
          <Counter value={counts.services} label={t('servicesCount', { count: counts.services })} tone="bg-background text-foreground" />
        </div>
      </Card>
      <section aria-labelledby="rx-help" className="no-print flex flex-col gap-2.5 rounded-panel bg-inverse p-6 text-inverse-foreground">
        <h2 id="rx-help" className="text-lg font-bold">{t('helpTitle')}</h2>
        <p className="text-sm leading-relaxed text-inverse-muted">{t('helpText')}</p>
        <Link href="/booking" className={`self-start ${buttonVariants({ variant: 'inverse' })}`}>{t('helpLink')}</Link>
      </section>
      <Card as="section" radius="panel" padding="lg" aria-labelledby="rx-print" className="no-print flex flex-col gap-2">
        <h2 id="rx-print" className="text-lg font-bold">{t('printTitle')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('printText')}</p>
      </Card>
    </aside>
  );
}
