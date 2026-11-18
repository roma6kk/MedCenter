'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { DiagnosisList } from './diagnosis-list';
import type { EncounterDetails } from './doctor-types';
import { ATC_SYSTEM } from './encounter-problem-fields';
import { useUnitLabel } from './unit-label';

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <Card as="section">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </Card>
  );
}

function Empty({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="text-muted-foreground">{children}</p>;
}

function Observations({ items }: { readonly items: EncounterDetails['observations'] }): ReactNode {
  const t = useT('doctor.readonly');
  const unitLabel = useUnitLabel();
  if (items.length === 0) return <Empty>{t('noObservations')}</Empty>;
  return (
    <ul className="grid gap-1.5">
      {items.map((item, index) => (
        <li key={`${item.code}-${index}`} className="flex flex-wrap items-baseline gap-2">
          <CodeChip code={item.code} system={item.codeSystem} />
          <span>{item.display ?? item.code}</span>
          <span className="tabular-nums font-semibold" title={item.unit}>{formatNumber(item.value)} {unitLabel(item.unit, item.code)}</span>
        </li>
      ))}
    </ul>
  );
}

function Services({ items }: { readonly items: EncounterDetails['serviceRequests'] }): ReactNode {
  const t = useT('doctor.readonly');
  if (items.length === 0) return <Empty>{t('noServices')}</Empty>;
  return (
    <ul className="grid gap-1.5">
      {items.map((item, index) => (
        <li key={`${item.code}-${index}`} className="flex flex-wrap items-baseline gap-2">
          <CodeChip code={item.code} system={item.codeSystem} />
          <span>{item.display ?? item.code}</span>
          {item.note ? <span className="text-muted-foreground">· {item.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function Medications({ items }: { readonly items: EncounterDetails['medicationRequests'] }): ReactNode {
  const t = useT('doctor.readonly');
  if (items.length === 0) return <Empty>{t('noMedications')}</Empty>;
  return (
    <ul className="grid gap-2">
      {items.map((item, index) => (
        <li key={`${item.atcCode}-${index}`}>
          <p className="flex flex-wrap items-baseline gap-2">
            <CodeChip code={item.atcCode} system={ATC_SYSTEM} />
            {item.atcDisplay ? <span className="font-semibold">{item.atcDisplay}</span> : null}
          </p>
          <p className="mt-1">{item.dosageText}</p>
          {item.note ? <p className="text-muted-foreground">{item.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function EncounterReadOnly({ encounter }: { readonly encounter: EncounterDetails }): ReactNode {
  const t = useT('doctor.readonly');
  return (
    <div className="grid gap-4" data-testid="encounter-record">
      <Section title={t('observations')}><Observations items={encounter.observations} /></Section>
      <Section title={t('diagnoses')}>{encounter.diagnoses.length > 0 ? <DiagnosisList diagnoses={encounter.diagnoses} /> : <Empty>{t('none')}</Empty>}</Section>
      <Section title={t('services')}><Services items={encounter.serviceRequests} /></Section>
      <Section title={t('medications')}><Medications items={encounter.medicationRequests} /></Section>
      <Section title={t('summary')}>{encounter.summary ? <p className="whitespace-pre-line">{encounter.summary}</p> : <Empty>{t('none')}</Empty>}</Section>
      <Section title={t('recommendations')}>{encounter.recommendations ? <p className="whitespace-pre-line">{encounter.recommendations}</p> : <Empty>{t('none')}</Empty>}</Section>
    </div>
  );
}
