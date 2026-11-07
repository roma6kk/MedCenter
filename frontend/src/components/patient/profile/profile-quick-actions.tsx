'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarCheck, FileText, Pill, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import type { Count } from './use-profile-data';

function countText(count: Count | null): string {
  return count === null ? '…' : `${count.value}${count.more ? '+' : ''}`;
}

function Action({ href, icon: Icon, title, hint }: { readonly href: string; readonly icon: LucideIcon; readonly title: string; readonly hint: string }): ReactNode {
  return (
    <li>
      <Link href={href} className="flex h-full min-h-[44px] items-center gap-3.5 rounded-card border border-border bg-card p-[18px] text-foreground hover:bg-secondary">
        <span aria-hidden="true" className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
          <Icon size={22} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">{title}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

export function ProfileQuickActions({ upcoming, activePrescriptions }: { readonly upcoming: Count | null; readonly activePrescriptions: Count | null }): ReactNode {
  const t = useT('patientProfile.actions');
  return (
    <ul aria-label={t('label')} className="grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
      <Action href="/appointments" icon={CalendarCheck} title={t('appointments')} hint={t('appointmentsHint', { count: countText(upcoming) })} />
      <Action href="/medcard?tab=prescriptions" icon={Pill} title={t('prescriptions')} hint={t('prescriptionsHint', { count: countText(activePrescriptions) })} />
      <Action href="/medcard" icon={FileText} title={t('history')} hint={t('historyHint')} />
    </ul>
  );
}
