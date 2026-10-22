'use client';

import type { ReactNode } from 'react';
import { Check, Clock, Mail, MapPin, Phone, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_CONTACTS, HOME_ANCHORS } from './home-content';

const TIPS: ReadonlyArray<string> = ['infoTip1', 'infoTip2', 'infoTip3', 'infoTip4'];

function ContactRow({ icon: Icon, label, children }: { readonly icon: LucideIcon; readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 h-[22px] w-[22px] flex-none text-primary" />
      <div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="text-[17px] font-semibold">{children}</dd>
      </div>
    </div>
  );
}

/** Practical help for a patient (what to know before and after a visit) and the clinic's contacts. */
export function HomeContacts(): ReactNode {
  const t = useT('home');
  return (
    <section id={HOME_ANCHORS.contacts} className={`${SECTION_CLASS} scroll-mt-4 grid gap-4 py-16 md:grid-cols-2`}>
      <Card radius="panel" padding="lg" className="flex flex-col gap-4">
        <h2 className="text-[22px] font-bold">{t('infoTitle')}</h2>
        <ul className="flex flex-col">
          {TIPS.map((key) => (
            <li key={key} className="flex items-start gap-3 border-t border-border py-3 text-base">
              <Check aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-success" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card radius="panel" padding="lg" className="flex flex-col gap-5">
        <h2 className="text-[22px] font-bold">{t('contactsTitle')}</h2>
        <dl className="flex flex-col gap-5">
          <ContactRow icon={MapPin} label={t('contactAddress')}>{t('contactAddressValue')}</ContactRow>
          <ContactRow icon={Phone} label={t('contactPhone')}>
            <a href={CLINIC_CONTACTS.phoneHref} className="hover:underline">{CLINIC_CONTACTS.phone}</a>
          </ContactRow>
          <ContactRow icon={Mail} label={t('contactEmail')}>
            <a href={`mailto:${CLINIC_CONTACTS.email}`} className="hover:underline">{CLINIC_CONTACTS.email}</a>
          </ContactRow>
          <ContactRow icon={Clock} label={t('contactHours')}>{t('contactHoursValue')}</ContactRow>
        </dl>
      </Card>
    </section>
  );
}
