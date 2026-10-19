'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import { rankGroups, sharePercent } from './analytics-math';
import type { MeasureGroup, MeasureReport } from './analytics-types';

interface GroupTableProps {
  readonly report: MeasureReport;
  readonly caption: string;
  readonly nameHeader: string;
  readonly countHeader: string;
  /** Shown when the group has no `display` (a deleted service keeps only its id). */
  readonly unknownLabel: string;
  /** `false` hides the code of a group that has a name (a service id tells an admin nothing); a nameless group always shows it. */
  readonly showCodes?: boolean;
}

function Bar({ percent }: { readonly percent: number }): ReactNode {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="block h-2 min-w-[64px] flex-1 rounded-[2px] bg-[var(--secondary)]">
        <span className="block h-2 rounded-[2px] bg-[var(--primary)]" style={{ width: `${percent}%` }} />
      </span>
      <span className="mono w-10 text-right text-xs">{percent}%</span>
    </span>
  );
}

interface GroupRowProps {
  readonly group: MeasureGroup;
  readonly total: number;
  readonly unknownLabel: string;
  readonly showCode: boolean;
}

function GroupRow({ group, total, unknownLabel, showCode }: GroupRowProps): ReactNode {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-3 py-2">
        {group.display ?? <span className="text-[var(--muted-foreground)]">{unknownLabel}</span>}{' '}
        {showCode || group.display === undefined ? <CodeChip code={group.code} {...(group.system === undefined ? {} : { system: group.system })} /> : null}
      </td>
      <td className="mono px-3 py-2 text-right">{group.count}</td>
      <td className="px-3 py-2">
        <Bar percent={sharePercent(group.count, total)} />
      </td>
    </tr>
  );
}

/** The groups of a report, biggest first, each with its count and its share of the total as a bar (9.2, 9.3). */
export function GroupTable({ report, caption, nameHeader, countHeader, unknownLabel, showCodes = true }: GroupTableProps): ReactNode {
  const t = useT('admin.analytics');
  return (
    <div tabIndex={0} className="overflow-x-auto rounded-[6px] border border-[var(--border)]">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="h-11 px-3 text-left font-medium">{nameHeader}</th>
            <th scope="col" className="h-11 px-3 text-right font-medium">{countHeader}</th>
            <th scope="col" className="h-11 px-3 text-left font-medium">{t('share')}</th>
          </tr>
        </thead>
        <tbody>
          {rankGroups(report.groups).map((group) => (
            <GroupRow key={`${group.system ?? ''}|${group.code}`} group={group} total={report.total} unknownLabel={unknownLabel} showCode={showCodes} />
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted-foreground)]">{t('totalLine', { count: report.total })}</p>
    </div>
  );
}
