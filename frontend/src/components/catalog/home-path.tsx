'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS, SECTION_LEAD_CLASS, SECTION_TITLE_CLASS } from './catalog-styles';

const STEPS: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4];

/**
 * The patient's way through the clinic: booking is only the first step of four. Four equal cards, joined by one line of
 * progress (C7): a rule runs through the number discs, horizontally from `lg` and vertically below it, so the steps read
 * as a sequence and no card looks chosen.
 */
export function HomePath(): ReactNode {
  const t = useT('home');
  return (
    <section aria-labelledby="home-path" className={`${SECTION_CLASS} flex flex-col gap-8 py-16`}>
      <div>
        <h2 id="home-path" className={SECTION_TITLE_CLASS}>{t('pathTitle')}</h2>
        <p className={SECTION_LEAD_CLASS}>{t('pathLead')}</p>
      </div>
      <ol className="grid gap-6 lg:grid-cols-4 lg:gap-5">
        {STEPS.map((step) => (
          <li key={step} data-testid="path-step" className="relative flex gap-4 lg:flex-col lg:gap-5">
            <div className="relative flex flex-none flex-col items-center lg:flex-row lg:items-center">
              <span aria-hidden="true" className="relative z-10 flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-primary bg-card text-sm font-bold tabular-nums text-primary">
                {String(step).padStart(2, '0')}
              </span>
              {step === STEPS.length ? null : (
                <span aria-hidden="true" data-testid="path-line" className="-mb-6 mt-1 w-0.5 flex-1 bg-primary-soft-hover lg:-mr-5 lg:mb-0 lg:ml-1 lg:mt-0 lg:h-0.5 lg:w-auto" />
              )}
            </div>
            <Card radius="panel" padding="lg" className="flex h-full flex-1 flex-col gap-2">
              <span className="text-lg font-bold">{t(`path${step}Title`)}</span>
              <span className="text-base leading-relaxed text-muted-foreground">{t(`path${step}Text`)}</span>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
