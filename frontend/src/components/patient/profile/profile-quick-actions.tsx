'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarPlus, FileText, Pill, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import type { Count } from './use-profile-data';

function countText(count: Count | null): string {
  return count === null ? '…' : `${count.value}${count.more ? '+' : ''}`;
}

function Action({ href, icon: Icon, title, hint, primary }: { readonly href: string; readonly icon: LucideIcon; readonly title: string; readonly hint: string; readonly primary?: boolean }): ReactNode {
  return (
    <li>
      <Link href={href} className={cn('flex h-full min-h-[44px] items-center gap-3.5 rounded-card p-[18px]', primary ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-secondary')}>
        <span aria-hidden="true" className={cn('inline-flex h-11 w-11 flex-none items-center justify-center rounded-[12px]', primary ? 'bg-card text-primary-soft-foreground' : 'bg-primary-soft text-primary-soft-foreground')}>
          <Icon size={22} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">{title}</span>
          <span className={cn('text-sm', primary ? 'text-primary-foreground' : 'text-muted-foreground')}>{hint}</span>
        </span>
      </Link>
    </li>
  );
}

/** The four things a patient comes here for. The counts are what the loaded pages hold; `…` while a read runs, `n+` when more pages exist. */
export function ProfileQuickActions({ upcoming, activePrescriptions }: { readonly upcoming: Count | null; readonly activePrescriptions: Count | null }): ReactNode {
  const t = useT('patientProfile.actions');
  return (
    <ul aria-label={t('label')} className="grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      <Action href="/booking" icon={CalendarPlus} title={t('book')} hint={t('bookHint')} primary />
      <Action href="/appointments" icon={CalendarCheck} title={t('appointments')} hint={t('appointmentsHint', { count: countText(upcoming) })} />
      <Action href="/prescriptions" icon={Pill} title={t('prescriptions')} hint={t('prescriptionsHint', { count: countText(activePrescriptions) })} />
      <Action href="/history" icon={FileText} title={t('history')} hint={t('historyHint')} />
    </ul>
  );
}
