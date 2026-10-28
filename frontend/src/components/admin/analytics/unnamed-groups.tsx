'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { useT } from '@/lib/i18n/use-t';
import type { MeasureGroup } from './analytics-types';

export type GroupKind = 'encounters' | 'services';

/** The groups that kept only a code (a deleted service, an unset specialty) merged into one label, their codes behind a «Подробнее» disclosure. */
export function UnnamedGroups({ groups, kind }: { readonly groups: ReadonlyArray<MeasureGroup>; readonly kind: GroupKind }): ReactNode {
  const t = useT('admin.analytics');
  return (
    <>
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
    </>
  );
}
