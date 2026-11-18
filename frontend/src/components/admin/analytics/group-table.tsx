'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { sharePercent, splitGroups } from './analytics-math';
import type { MeasureGroup, MeasureReport } from './analytics-types';
import { ShareBar } from './share-bar';
import { UnnamedGroups, type GroupKind } from './unnamed-groups';

interface GroupTableProps {
  readonly report: MeasureReport;
  readonly caption: string;
  readonly nameHeader: string;
  readonly countHeader: string;
  readonly kind: GroupKind;
  readonly others?: number;
}

const HEAD_CELL = 'px-5 py-2.5 text-xs font-semibold text-[var(--muted-foreground)]';
const NUMBER_CELL = 'tabular-nums px-5 py-3.5 text-right';

function UnnamedRow({ groups, total, kind }: { readonly groups: ReadonlyArray<MeasureGroup>; readonly total: number; readonly kind: GroupKind }): ReactNode {
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <tr data-testid="unnamed-row" className="border-t border-[var(--border)] text-[var(--muted-foreground)]">
      <td className="px-5 py-3.5">
        <UnnamedGroups groups={groups} kind={kind} />
      </td>
      <td className={NUMBER_CELL}>{count}</td>
      <ShareCell count={count} total={total} />
    </tr>
  );
}

function ShareCell({ count, total }: { readonly count: number; readonly total: number }): ReactNode {
  const percent = sharePercent(count, total);
  return (
    <td className="px-5 py-3.5">
      <div className="flex items-center justify-end gap-3">
        <ShareBar percent={percent} className="hidden w-24 sm:block" />
        <span className="tabular-nums w-10 text-right">{percent}%</span>
      </div>
    </td>
  );
}

export function GroupTable({ report, caption, nameHeader, countHeader, kind, others = 0 }: GroupTableProps): ReactNode {
  const t = useT('admin.analytics');
  const { named, unnamed } = splitGroups(report.groups);
  return (
    <div tabIndex={0} className="-mx-6 overflow-x-auto">
      <table className="w-full text-base">
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
              <ShareCell count={group.count} total={report.total} />
            </tr>
          ))}
          {unnamed.length > 0 ? <UnnamedRow groups={unnamed} total={report.total} kind={kind} /> : null}
          {others > 0 ? (
            <tr className="border-t border-[var(--border)] text-[var(--muted-foreground)]">
              <td className="px-5 py-3.5">{t('services.others')}</td>
              <td className={NUMBER_CELL}>{others}</td>
              <ShareCell count={others} total={report.total} />
            </tr>
          ) : null}
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
