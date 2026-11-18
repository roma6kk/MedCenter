'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { writeUrlQuery } from '@/hooks/use-url-state';
import { useT } from '@/lib/i18n/use-t';
import { HistoryTimeline } from './history-timeline';
import type { MedcardTab } from './medcard-tab';
import { PrescriptionList } from './prescription-list';
import { SegmentedTabs, tabPanelProps, type TabOption } from './segmented-tabs';

const TABS_ID = 'medcard';

export function MedicalRecord({ initialTab = 'history' }: { readonly initialTab?: MedcardTab }): ReactNode {
  const t = useT('medcard');
  const [tab, setTab] = useState<MedcardTab>(initialTab);
  useDocumentTitle(t('title'));
  const change = useCallback((next: MedcardTab): void => {
    setTab(next);
    writeUrlQuery(next === 'history' ? '' : `tab=${next}`);
  }, []);
  const options: ReadonlyArray<TabOption<MedcardTab>> = [
    { value: 'history', label: t('tabHistory') },
    { value: 'prescriptions', label: t('tabPrescriptions') },
  ];
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1.5 text-base text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div><SegmentedTabs idPrefix={TABS_ID} label={t('tabsLabel')} options={options} value={tab} onChange={change} /></div>
      <div {...tabPanelProps(TABS_ID, tab)}>{tab === 'history' ? <HistoryTimeline embedded /> : <PrescriptionList embedded />}</div>
    </section>
  );
}
