'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { sharePercent, splitGroups } from './analytics-math';
import type { MeasureReport } from './analytics-types';
import { ShareBar } from './share-bar';
import { UnnamedGroups } from './unnamed-groups';

interface GroupBarsProps {
  readonly report: MeasureReport;
  readonly caption: string;
}

interface Row {
  readonly key: string;
  readonly count: number;
  readonly label: ReactNode;
  readonly muted: boolean;
}

export function GroupBars({ report, caption }: GroupBarsProps): ReactNode {
  const t = useT('admin.analytics');
  const { named, unnamed } = splitGroups(report.groups);
  const rows: ReadonlyArray<Row> = [
    ...named.map((group): Row => ({ key: `${group.system ?? ''}|${group.code}`, count: group.count, label: group.display, muted: false })),
    ...(unnamed.length === 0 ? [] : [{ key: 'unnamed', count: unnamed.reduce((sum, group) => sum + group.count, 0), label: <UnnamedGroups groups={unnamed} kind="encounters" />, muted: true }]),
  ];
  const top: number = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div>
      <ul aria-label={caption} className="grid gap-4">
        {rows.map((row) => (
          <li key={row.key} data-testid={row.key === 'unnamed' ? 'unnamed-row' : 'bar-row'}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={row.muted ? 'text-base text-muted-foreground' : 'text-base font-semibold'}>{row.label}</span>
              <span className="flex-none text-sm tabular-nums">
                <span className="font-semibold">{row.count}</span> <span className="text-muted-foreground">· {sharePercent(row.count, report.total)}%</span>
              </span>
            </div>
            <ShareBar percent={(row.count * 100) / top} />
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
        {t('table.total')}: <span className="font-semibold text-foreground tabular-nums">{report.total}</span>
      </p>
    </div>
  );
}
