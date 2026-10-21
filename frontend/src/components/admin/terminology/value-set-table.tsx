'use client';

import type { ReactNode } from 'react';
import { CodeChip } from '@/components/feedback/code-chip';
import { StampBadge } from '@/components/feedback/stamp-badge';
import { useT } from '@/lib/i18n/use-t';
import type { ValueSetSummary } from './terminology-types';

function StatusCell({ status }: { readonly status: string | undefined }): ReactNode {
  const t = useT('admin.terminology');
  if (status === undefined) return '—';
  if (status === 'active') return <StampBadge status="active" />;
  return <StampBadge status="pending">{t(`status.${status === 'draft' || status === 'retired' ? status : 'unknown'}`)}</StampBadge>;
}

/** The canonical URL of a ValueSet is long and has no break points: it wraps anywhere instead of widening the card. */
function UrlChip({ url }: { readonly url: string }): ReactNode {
  return (
    <span className="inline-block max-w-full break-all">
      <CodeChip code={url} />
    </span>
  );
}

function ValueSetCards({ rows }: { readonly rows: ReadonlyArray<ValueSetSummary> }): ReactNode {
  const t = useT('admin.terminology');
  return (
    <ul className="grid gap-2 md:hidden">
      {rows.map((row) => (
        <li key={row.url} className="grid gap-1 rounded-card border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
          <p className="font-medium">{row.title ?? row.name}</p>
          <p>
            <span className="text-[var(--muted-foreground)]">{t('valueSets.columns.url')}: </span>
            <UrlChip url={row.url} />
          </p>
          <p>
            <span className="text-[var(--muted-foreground)]">{t('valueSets.columns.version')}: </span>
            <span className="mono text-xs">{row.version ?? '—'}</span>
          </p>
          <p>
            <span className="text-[var(--muted-foreground)]">{t('valueSets.columns.status')}: </span>
            <StatusCell status={row.status} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function ValueSetDesktopTable({ rows }: { readonly rows: ReadonlyArray<ValueSetSummary> }): ReactNode {
  const t = useT('admin.terminology');
  return (
    <div tabIndex={0} className="overflow-x-auto rounded-card border border-[var(--border)] max-md:hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('valueSets.title')}</caption>
        <thead>
          <tr>
            <th scope="col" className="h-11 px-3 text-left font-medium">{t('valueSets.columns.title')}</th>
            <th scope="col" className="h-11 px-3 text-left font-medium">{t('valueSets.columns.url')}</th>
            <th scope="col" className="h-11 px-3 text-left font-medium">{t('valueSets.columns.version')}</th>
            <th scope="col" className="h-11 px-3 text-left font-medium">{t('valueSets.columns.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.url} className="border-t border-[var(--border)] hover:bg-secondary">
              <td className="px-3 py-2">{row.title ?? row.name}</td>
              <td className="px-3 py-2"><CodeChip code={row.url} /></td>
              <td className="mono px-3 py-2 text-xs">{row.version ?? '—'}</td>
              <td className="px-3 py-2"><StatusCell status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The seeded ValueSets: title, canonical URL, release, status (FR-018). A table from `md` up, one card per set below. */
export function ValueSetTable({ rows }: { readonly rows: ReadonlyArray<ValueSetSummary> }): ReactNode {
  return (
    <>
      <ValueSetDesktopTable rows={rows} />
      <ValueSetCards rows={rows} />
    </>
  );
}
