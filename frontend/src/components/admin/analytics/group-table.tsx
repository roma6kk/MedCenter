'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import { sharePercent, splitGroups } from './analytics-math';
import type { MeasureGroup, MeasureReport } from './analytics-types';

interface GroupTableProps {
  readonly report: MeasureReport;
  readonly caption: string;
  readonly nameHeader: string;
  readonly countHeader: string;
  /** Which messages explain the groups that have no name: `<kind>.unknown`, `<kind>.unknownMany`, `<kind>.unknownNote`. */
  readonly kind: 'encounters' | 'services';
}

const HEAD_CELL = 'px-5 py-2.5 text-[13px] font-semibold text-[var(--muted-foreground)]';
const NUMBER_CELL = 'mono px-5 py-3.5 text-right';

function UnnamedRow({ groups, total, kind }: { readonly groups: ReadonlyArray<MeasureGroup>; readonly total: number; readonly kind: GroupTableProps['kind'] }): ReactNode {
  const t = useT('admin.analytics');
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <tr data-testid="unnamed-row" className="border-t border-[var(--border)] text-[var(--muted-foreground)]">
      <td className="px-5 py-3.5">
        {groups.length === 1 ? t(`${kind}.unknown`) : t(`${kind}.unknownMany`, { count: groups.length })}
        <details className="mt-0.5">
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-primary-soft-foreground underline underline-offset-2">{t('table.details')}</summary>
          <p className="max-w-md text-xs">{t(`${kind}.unknownNote`)}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {groups.map((group) => (
              <li key={`${group.system ?? ''}|${group.code}`}>
                <CodeChip code={group.code} {...(group.system === undefined ? {} : { system: group.system })} />
              </li>
            ))}
          </ul>
        </details>
      </td>
      <td className={NUMBER_CELL}>{count}</td>
      <td className={NUMBER_CELL}>{sharePercent(count, total)}%</td>
    </tr>
  );
}

/**
 * The groups of a report, biggest first, each with its count and its share, and a totals row (9.2, 9.3). The groups that
 * kept only a code (a deleted service) are merged into one row; their codes are behind a disclosure.
 */
export function GroupTable({ report, caption, nameHeader, countHeader, kind }: GroupTableProps): ReactNode {
  const t = useT('admin.analytics');
  const { named, unnamed } = splitGroups(report.groups);
  return (
    <div tabIndex={0} className="-mx-6 overflow-x-auto">
      <table className="w-full text-[15px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-[var(--secondary)] text-left">
            <th scope="col" className={HEAD_CELL}>{nameHeader}</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>{countHeader}</th>
            <th scope="col" className={`${HEAD_CELL} text-right`}>{t('share')}</th>
          </tr>
        </thead>
        <tbody>
          {named.map((group) => (
            <tr key={`${group.system ?? ''}|${group.code}`} className="border-t border-[var(--border)]">
              <td className="px-5 py-3.5 font-semibold">{group.display}</td>
              <td className={NUMBER_CELL}>{group.count}</td>
              <td className={NUMBER_CELL}>{sharePercent(group.count, report.total)}%</td>
            </tr>
          ))}
          {unnamed.length > 0 ? <UnnamedRow groups={unnamed} total={report.total} kind={kind} /> : null}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--border)] bg-[var(--background)]">
            <th scope="row" className="px-5 py-3.5 text-left font-bold">{t('table.total')}</th>
            <td className={`${NUMBER_CELL} font-semibold`}>{report.total}</td>
            <td className={NUMBER_CELL}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
