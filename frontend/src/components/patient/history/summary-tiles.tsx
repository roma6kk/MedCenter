import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import type { PageMeta } from '@/lib/api/pagination';
import { CodeTag } from './code-tag';
import type { HistorySummary } from './history-model';

interface SummaryTilesProps {
  readonly summary: HistorySummary;
  readonly meta: PageMeta;
}

function Tile({ value, label, scope, soft }: { readonly value: ReactNode; readonly label: string; readonly scope?: string; readonly soft?: boolean }): ReactNode {
  return (
    <li className="min-w-0">
      <Card radius="card" className={soft ? 'h-full border-primary-soft bg-primary-soft px-[18px] py-4 text-primary-soft-foreground' : 'h-full px-[18px] py-4'}>
        <div className="text-[28px] font-bold leading-tight">{value}</div>
        <div className={soft ? 'text-sm' : 'text-sm text-muted-foreground'}>{label}{scope ? <span className="block text-xs">{scope}</span> : null}</div>
      </Card>
    </li>
  );
}

/**
 * Four figures. The visit total is the response's `totalItems`; every other figure is computed from the page that is
 * loaded, so on a multi-page history it is labelled "on this page" (the newest visit needs no label on page 1).
 */
export function SummaryTiles({ summary, meta }: SummaryTilesProps): ReactNode {
  const t = useT('patientHistory');
  const format = useClinicFormat();
  const partial = meta.totalPages > 1;
  const pageOnly = partial ? t('onThisPage') : undefined;
  const lastScope = partial && meta.page > 1 ? pageOnly : undefined;
  return (
    <ul aria-label={t('summaryLabel')} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <Tile value={meta.totalItems} label={t('tileVisits')} />
      <Tile value={summary.lastVisit === undefined ? t('noFigure') : format.date(summary.lastVisit)} label={t('tileLast')} scope={lastScope} />
      <Tile value={summary.practitioners} label={t('tilePractitioners')} scope={pageOnly} />
      <Tile
        soft
        value={summary.topDiagnosis === undefined ? t('noFigure') : <CodeTag code={summary.topDiagnosis.code} className="bg-transparent px-0 text-[22px] font-semibold text-primary-soft-foreground" />}
        label={t('tileTopDiagnosis')}
        scope={pageOnly}
      />
    </ul>
  );
}
