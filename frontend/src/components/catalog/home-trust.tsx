'use client';

import type { ReactNode } from 'react';
import { Activity, Briefcase, FileText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_LICENSE } from './home-content';

function TrustItem({ icon: Icon, title, text }: { readonly icon: LucideIcon; readonly title: string; readonly text: string }): ReactNode {
  return (
    <li>
      <Card className="flex h-full items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-[22px] w-[22px] flex-none text-primary" />
        <span>
          <span className="block font-bold">{title}</span>
          <span className="text-sm text-muted-foreground">{text}</span>
        </span>
      </Card>
    </li>
  );
}

/** Four facts that make a first-time visitor trust the clinic: licence, diagnostics, health record, corporate care. */
export function HomeTrust(): ReactNode {
  const t = useT('home');
  return (
    <section aria-label={t('trustLabel')} className={`${SECTION_CLASS} pb-14`}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TrustItem icon={ShieldCheck} title={t('trustLicenseTitle')} text={t('trustLicense', { number: CLINIC_LICENSE.number, date: CLINIC_LICENSE.date })} />
        <TrustItem icon={Activity} title={t('trustDiagTitle')} text={t('trustDiag')} />
        <TrustItem icon={FileText} title={t('trustRecordTitle')} text={t('trustRecord')} />
        <TrustItem icon={Briefcase} title={t('trustCorpTitle')} text={t('trustCorp')} />
      </ul>
    </section>
  );
}
