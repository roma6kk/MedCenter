'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { splitGroups, statusCounts } from './analytics-math';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

interface CheckListProps {
  readonly appointments: AppointmentsReport | undefined;
  readonly encounters: MeasureReport | undefined;
  readonly services: MeasureReport | undefined;
}

interface CheckItem {
  readonly key: 'audit' | 'schedules' | 'services';
  readonly href: string;
  readonly count?: number;
}

/** What follows from the numbers, as links: only the checks that the data calls for are listed. */
function checkItems({ appointments, encounters, services }: CheckListProps): ReadonlyArray<CheckItem> {
  const items: CheckItem[] = [];
  if (appointments !== undefined && statusCounts(appointments).cancelled > 0) items.push({ key: 'audit', href: '/admin/audit' });
  if ((appointments?.total ?? 0) > 0 || (encounters?.total ?? 0) > 0) items.push({ key: 'schedules', href: '/admin/schedules' });
  const deleted = services === undefined ? 0 : splitGroups(services.groups).unnamed.length;
  if (deleted > 0) items.push({ key: 'services', href: '/admin/services', count: deleted });
  return items;
}

export function CheckList(props: CheckListProps): ReactNode {
  const t = useT('admin.analytics.check');
  const items = checkItems(props);
  if (items.length === 0) return null;
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby="analytics-check-title" className="flex flex-col gap-3.5">
      <h2 id="analytics-check-title" className="text-xl font-bold">{t('title')}</h2>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {items.map((item, index) => (
          <li key={item.key} className="flex gap-3 rounded-card bg-[var(--background)] p-4">
            <span aria-hidden="true" className="mono inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[13px] font-bold">
              {index + 1}
            </span>
            <span className="text-[15px] leading-normal">
              {t(`${item.key}.text`, { count: item.count ?? 0 })}{' '}
              <Link href={item.href} className="font-semibold text-primary-soft-foreground underline underline-offset-2">
                {t(`${item.key}.link`)}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
