import type { ReactNode } from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { WRAP_TEXT } from '../wrap-text';
import { CodeTag } from './code-tag';
import type { DiagnosisCount } from './history-model';

/** Diagnosis frequency bars of the loaded page; the count is read as text, the bar only repeats it. */
export function DiagnosisPanel({ frequency }: { readonly frequency: ReadonlyArray<DiagnosisCount> }): ReactNode {
  const t = useT('patientHistory');
  if (frequency.length === 0) return null;
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="hx-dx" className="flex flex-col gap-3">
      <h2 id="hx-dx" className="text-lg font-bold">{t('frequencyTitle')}</h2>
      <ul className="flex flex-col gap-3">
        {frequency.map((item) => (
          <li key={item.code} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3 text-sm">
              <span className={WRAP_TEXT}><CodeTag code={item.code} className="bg-transparent px-0" /> {item.display}</span>
              <span className="mono shrink-0" aria-label={t('frequencyVisits', { count: item.count })}>{item.count}</span>
            </div>
            <div aria-hidden="true" className="h-2 rounded-full bg-secondary"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(item.share * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">{t('frequencyNote')}</p>
    </Card>
  );
}

/** The repeat-visit card; no doctor is named because the history carries only a role id. */
export function RepeatVisitCard(): ReactNode {
  const t = useT('patientHistory');
  return (
    <section aria-labelledby="hx-next" className="flex flex-col gap-2.5 rounded-panel bg-inverse p-[22px] text-inverse-foreground">
      <h2 id="hx-next" className="text-lg font-bold">{t('repeatTitle')}</h2>
      <p className="text-sm leading-normal text-inverse-muted">{t('repeatText')}</p>
      <Link href="/booking" className={`${buttonVariants({ variant: 'inverse' })} self-start`}>{t('repeatCta')}</Link>
    </section>
  );
}
