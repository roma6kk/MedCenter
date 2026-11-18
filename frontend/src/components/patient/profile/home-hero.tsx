'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { QueryFailure } from '@/components/feedback/query-error-state';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { NextAppointment } from '@/components/appointments/next-appointment';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { WRAP_TEXT } from '../wrap-text';
import { givenNameOf } from './profile-name';
import { activeAppointments, type ProfileData } from './use-profile-data';

function NoVisit(): ReactNode {
  const t = useT('patientHome.hero');
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="home-hero-title" data-testid="home-hero-empty" className="flex flex-wrap items-center gap-6 p-7 shadow-elev-2">
      <span aria-hidden="true" className="inline-flex size-24 flex-none items-center justify-center rounded-card bg-primary-soft text-primary-soft-foreground">
        <CalendarPlus className="size-10" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-[999_1_280px] flex-col gap-1.5">
        <h2 id="home-hero-title" className="text-xl font-bold tracking-tight sm:text-2xl">{t('emptyTitle')}</h2>
        <p className="text-base text-muted-foreground">{t('emptyText')}</p>
      </div>
      <Link href="/booking" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'flex-none')}>{t('book')}</Link>
    </Card>
  );
}

export function HomeHero({ data }: { readonly data: ProfileData }): ReactNode {
  const t = useT('patientHome');
  const given: string = givenNameOf(data.account.data, data.patient.data ?? null);
  const booked = activeAppointments(data.upcoming.data);
  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-5">
      <h1 id="home-title" className={cn('text-3xl font-bold tracking-tight', WRAP_TEXT)}>{given === '' ? t('greetingAnon') : t('greeting', { name: given })}</h1>
      {data.account.data === undefined ? <QueryFailure query={data.account} embedded pending={null} /> : null}
      {data.upcoming.data === undefined ? (
        <Card as="div" radius="panel" padding="none" className="p-6"><QueryFailure query={data.upcoming} embedded pending={<ContentSkeleton shape="detail" />} /></Card>
      ) : booked[0] === undefined ? (
        <NoVisit />
      ) : (
        <NextAppointment appointment={booked[0]} more={Math.max(booked.length - 1, 0)} />
      )}
    </section>
  );
}
