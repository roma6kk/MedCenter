'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { cancellationInsight, noshowInsight, specialtyInsight } from './analytics-insights';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

type Tone = 'destructive' | 'warning' | 'primary';

const TONE_CLASS: Record<Tone, { readonly card: string; readonly value: string }> = {
  destructive: { card: 'bg-destructive-soft', value: 'text-destructive' },
  warning: { card: 'bg-warning-soft', value: 'text-warning' },
  primary: { card: 'bg-primary-soft', value: 'text-primary-soft-foreground' },
};

interface InsightCardProps {
  readonly tone: Tone;
  readonly value: string;
  readonly title: string;
  readonly href: string;
  readonly link: string;
  readonly children: ReactNode;
}

function InsightCard({ tone, value, title, href, link, children }: InsightCardProps): ReactNode {
  return (
    <Card as="article" radius="panel" padding="lg" data-testid="insight" className={cn('flex flex-col gap-2.5 border-transparent', TONE_CLASS[tone].card)}>
      <span className={cn('serif text-5xl font-bold leading-none', TONE_CLASS[tone].value)}>{value}</span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-[15px] leading-normal">{children}</p>
      <Link href={href} className="mt-auto inline-flex min-h-[44px] items-center text-[15px] font-semibold underline underline-offset-2">
        {link}
      </Link>
    </Card>
  );
}

interface InsightCardsProps {
  readonly appointments: AppointmentsReport | undefined;
  readonly encounters: MeasureReport | undefined;
}

/**
 * Up to three findings, each worded from the numbers of the reports. A card exists only when its report has data behind it
 * (nothing cancelled, no completed encounter: no card); with no card at all the section is not rendered.
 */
export function InsightCards({ appointments, encounters }: InsightCardsProps): ReactNode {
  const t = useT('admin.analytics.insights');
  const cancelled = appointments === undefined ? null : cancellationInsight(appointments);
  const noshow = appointments === undefined ? null : noshowInsight(appointments);
  const specialty = encounters === undefined ? null : specialtyInsight(encounters);
  if (cancelled === null && noshow === null && specialty === null) return null;
  return (
    <section aria-label={t('label')} className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
      {cancelled === null ? null : (
        <InsightCard tone="destructive" value={`${cancelled.percent}%`} title={t('cancelled.title')} href="/admin/audit" link={t('cancelled.link')}>
          {t('cancelled.text', { count: cancelled.count, total: cancelled.total })} {t(`cancelled.${cancelled.comparison}`, { booked: cancelled.booked, noshow: cancelled.noshow })}
        </InsightCard>
      )}
      {noshow === null ? null : (
        <InsightCard tone="warning" value={String(noshow.count)} title={t('noshow.title', { percent: noshow.percent })} href="/admin/schedules" link={t('noshow.link')}>
          {t('noshow.text')}
        </InsightCard>
      )}
      {specialty === null ? null : (
        <InsightCard tone="primary" value={`${specialty.percent}%`} title={t('specialty.title', { name: specialty.name })} href="/admin/schedules" link={t('specialty.link')}>
          {t('specialty.text', { count: specialty.count, total: specialty.total })}
          {specialty.only ? ` ${t('specialty.single')}` : ''}
        </InsightCard>
      )}
    </section>
  );
}
