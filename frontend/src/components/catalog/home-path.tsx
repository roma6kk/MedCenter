'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_LEAD_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';

const STEPS: ReadonlyArray<{ readonly id: 1 | 2 | 3 | 4; readonly emphasized: boolean }> = [
  { id: 1, emphasized: false },
  { id: 2, emphasized: false },
  { id: 3, emphasized: false },
  { id: 4, emphasized: true },
];

/** The patient's way through the clinic: booking is only the first step of four. */
export function HomePath(): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-path" className={`${SECTION_CLASS} flex flex-col gap-8 py-16`}>
      <div>
        <h2 id="home-path" className={SECTION_TITLE_CLASS}>{t('pathTitle')}</h2>
        <p className={SECTION_LEAD_CLASS}>{t('pathLead')}</p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.id}>
            <Card
              radius="panel"
              padding="lg"
              className={`flex h-full flex-col gap-2 ${step.emphasized ? 'border-primary bg-primary text-primary-foreground' : ''}`}
            >
              <span className="mono text-[13px]">{String(step.id).padStart(2, '0')}</span>
              <span className="text-lg font-bold">{t(`path${step.id}Title`)}</span>
              <span className={`text-[15px] leading-relaxed ${step.emphasized ? '' : 'text-muted-foreground'}`}>{t(`path${step.id}Text`)}</span>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
