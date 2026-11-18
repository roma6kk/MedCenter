'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LoadingNote } from '@/components/feedback/loading-note';
import { Skeleton } from '@/components/ui/skeleton';
import type { Translate } from '@/lib/i18n/translate';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { useUiStore } from '@/store/use-ui-store';
import { APPOINTMENT_STATUSES, type AppointmentStatusCode } from './analytics-types';
import { axisLabel, bucketTitle } from './bucket-label';
import { labelStride, niceAxis, roundedTopPath } from './chart-math';
import { HATCH_KEY_STYLE, STATUS_KEY_CLASS } from './status-style';
import type { AppointmentSeries, SeriesPoint } from './use-analytics';

const STACK_ORDER: ReadonlyArray<AppointmentStatusCode> = ['fulfilled', 'noshow', 'booked', 'cancelled'];

const FILL_CLASS: Readonly<Record<Exclude<AppointmentStatusCode, 'noshow'>, string>> = {
  booked: 'fill-info',
  fulfilled: 'fill-success',
  cancelled: 'fill-destructive',
};

const HEIGHT = 264;
const MARGIN = { top: 12, right: 8, bottom: 30, left: 34 } as const;
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;
const FALLBACK_WIDTH = 640;
const MIN_LABEL_GAP = 44;

const totalOf = (point: SeriesPoint): number => STACK_ORDER.reduce((sum, status) => sum + point.counts[status], 0);

function useWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState<number>(FALLBACK_WIDTH);
  useEffect(() => {
    const node: HTMLElement | null = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWidth(Math.max(240, node.clientWidth)));
    observer.observe(node);
    setWidth(Math.max(240, node.clientWidth));
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface Segment {
  readonly status: AppointmentStatusCode;
  readonly y: number;
  readonly height: number;
}

function segmentsOf(point: SeriesPoint, yOf: (value: number) => number): ReadonlyArray<Segment> {
  let sum = 0;
  return STACK_ORDER.filter((status) => point.counts[status] > 0).map((status, index) => {
    const bottom: number = yOf(sum);
    sum += point.counts[status];
    const top: number = yOf(sum);
    const full: number = bottom - top;
    const height: number = index === 0 ? full : Math.max(Math.min(full, 1.5), full - GAP);
    return { status, y: top, height };
  });
}

function Legend(): ReactNode {
  const t = useT('admin.analytics.appointments');
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label={t('legend')}>
      {APPOINTMENT_STATUSES.map((status) => (
        <li key={status} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cn('size-3 rounded-sm', STATUS_KEY_CLASS[status])} style={status === 'noshow' ? HATCH_KEY_STYLE : undefined} />
          {t(status)}
        </li>
      ))}
    </ul>
  );
}

interface TooltipProps {
  readonly point: SeriesPoint;
  readonly title: string;
  readonly left: number;
  readonly side: 'left' | 'right';
}

function Tooltip({ point, title, left, side }: TooltipProps): ReactNode {
  const t = useT('admin.analytics.appointments');
  return (
    <div
      data-testid="chart-tooltip"
      aria-hidden="true"
      style={{ left, top: MARGIN.top, transform: side === 'left' ? 'translateX(-100%)' : undefined }}
      className="pointer-events-none absolute z-10 w-52 rounded-card border border-border bg-card p-3 shadow-elev-2"
    >
      <p className="mb-1.5 text-xs font-semibold">{title}</p>
      <ul className="grid gap-1">
        {APPOINTMENT_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-2 text-sm">
            <span className={cn('h-0.5 w-3.5 flex-none rounded-full', STATUS_KEY_CLASS[status])} />
            <span className="font-semibold tabular-nums">{point.counts[status]}</span>
            <span className="text-muted-foreground">{t(status)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-border pt-1.5 text-sm">
        <span className="font-semibold tabular-nums">{totalOf(point)}</span> <span className="text-muted-foreground">{t('total').toLowerCase()}</span>
      </p>
    </div>
  );
}

function describe(point: SeriesPoint, title: string, t: Translate): string {
  return `${title}: ${APPOINTMENT_STATUSES.map((status) => `${t(status).toLowerCase()} ${point.counts[status]}`).join(', ')}`;
}

interface ColumnsProps {
  readonly points: ReadonlyArray<SeriesPoint>;
}

function Columns({ points }: ColumnsProps): ReactNode {
  const t = useT('admin.analytics.chart');
  const tStatus = useT('admin.analytics.appointments');
  const locale = useUiStore((state) => state.locale);
  const hatchId: string = useId();
  const liveId: string = useId();
  const box = useRef<HTMLDivElement>(null);
  const width: number = useWidth(box);
  const [active, setActive] = useState<number | null>(null);
  const plotWidth: number = width - MARGIN.left - MARGIN.right;
  const plotHeight: number = HEIGHT - MARGIN.top - MARGIN.bottom;
  const axis = niceAxis(Math.max(...points.map(totalOf)));
  const band: number = plotWidth / points.length;
  const barWidth: number = Math.max(3, Math.min(MAX_BAR, band * 0.6));
  const yOf = (value: number): number => MARGIN.top + plotHeight - (value / axis.max) * plotHeight;
  const stride: number = labelStride(points.length, plotWidth, MIN_LABEL_GAP);
  const total: number = points.reduce((sum, point) => sum + totalOf(point), 0);
  const handleMove = (event: MouseEvent<SVGSVGElement>): void => {
    const x: number = event.clientX - event.currentTarget.getBoundingClientRect().left - MARGIN.left;
    setActive(Math.min(points.length - 1, Math.max(0, Math.floor(x / band))));
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last: number = points.length - 1;
    const next: number | undefined = { ArrowRight: Math.min(last, (active ?? -1) + 1), ArrowLeft: Math.max(0, (active ?? 1) - 1), Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  };
  const activePoint: SeriesPoint | undefined = active === null ? undefined : points[active];
  const centre: number = MARGIN.left + (active ?? 0) * band + band / 2;
  const side: 'left' | 'right' = centre > width / 2 ? 'left' : 'right';
  return (
    <div
      ref={box}
      role="group"
      tabIndex={0}
      aria-label={t('label', { total })}
      aria-describedby={liveId}
      onKeyDown={handleKey}
      onFocus={() => setActive((current) => current ?? 0)}
      onBlur={() => setActive(null)}
      className="relative rounded-card"
    >
      <p id={liveId} aria-live="polite" className="sr-only">
        {activePoint === undefined ? t('hint') : describe(activePoint, bucketTitle(activePoint.bucket, locale), tStatus)}
      </p>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" onMouseMove={handleMove} onMouseLeave={() => setActive(null)} className="block max-w-full">
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-warning" />
            <rect width="2" height="6" className="fill-card" />
          </pattern>
        </defs>
        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yOf(tick)} y2={yOf(tick)} className="stroke-border" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={yOf(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
              {tick}
            </text>
          </g>
        ))}
        {active === null ? null : <rect data-testid="chart-active" x={MARGIN.left + active * band} y={MARGIN.top} width={band} height={plotHeight} rx={RADIUS} className="fill-secondary" />}
        {points.map((point, index) => {
          const x: number = MARGIN.left + index * band + (band - barWidth) / 2;
          const segments = segmentsOf(point, yOf);
          const lastSegment: Segment | undefined = segments.at(-1);
          return (
            <g key={point.bucket.from} data-testid="chart-column">
              {segments.map((segment) => {
                const fill: string | undefined = segment.status === 'noshow' ? `url(#${hatchId})` : undefined;
                const className: string | undefined = segment.status === 'noshow' ? undefined : FILL_CLASS[segment.status];
                return segment === lastSegment ? (
                  <path key={segment.status} d={roundedTopPath(x, segment.y, barWidth, segment.height, RADIUS)} fill={fill} className={className} />
                ) : (
                  <rect key={segment.status} x={x} y={segment.y} width={barWidth} height={segment.height} fill={fill} className={className} />
                );
              })}
              {index % stride === 0 ? (
                <text x={MARGIN.left + index * band + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-xs">
                  {axisLabel(point.bucket, index, locale)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {activePoint === undefined ? null : <Tooltip point={activePoint} title={bucketTitle(activePoint.bucket, locale)} left={side === 'left' ? centre - band / 2 - 8 : centre + band / 2 + 8} side={side} />}
    </div>
  );
}

function SeriesTable({ points }: ColumnsProps): ReactNode {
  const t = useT('admin.analytics.chart');
  const tStatus = useT('admin.analytics.appointments');
  const locale = useUiStore((state) => state.locale);
  return (
    <div tabIndex={0} className="max-h-80 overflow-auto rounded-card">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('tableCaption')}</caption>
        <thead>
          <tr className="sticky top-0 bg-secondary text-left">
            <th scope="col" className="px-3 py-2 text-xs font-semibold text-muted-foreground">{t('period')}</th>
            {APPOINTMENT_STATUSES.map((status) => (
              <th key={status} scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{tStatus(status)}</th>
            ))}
            <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{tStatus('total')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.bucket.from} className="border-t border-border">
              <th scope="row" className="px-3 py-2 text-left font-medium">{bucketTitle(point.bucket, locale)}</th>
              {APPOINTMENT_STATUSES.map((status) => (
                <td key={status} className="px-3 py-2 text-right tabular-nums">{point.counts[status]}</td>
              ))}
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{totalOf(point)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type View = 'chart' | 'table';

interface AppointmentsChartProps {
  readonly series: AppointmentSeries;
  readonly columns: number;
}

export function AppointmentsChart({ series, columns }: AppointmentsChartProps): ReactNode {
  const t = useT('admin.analytics.chart');
  const [view, setView] = useState<View>('chart');
  const headingId: string = useId();
  if (columns < 2) return null;
  const points: ReadonlyArray<SeriesPoint> | undefined = series.points;
  const isEmpty: boolean = points !== undefined && points.every((point) => totalOf(point) === 0);
  return (
    <Card as="section" radius="panel" padding="lg" aria-labelledby={headingId} className="grid gap-4" data-testid="appointments-chart">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-bold">{t('title')}</h2>
        {points === undefined || isEmpty ? null : (
          <SegmentedControl<View>
            kind="toggle"
            size="md"
            label={t('view')}
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: t('viewChart') },
              { value: 'table', label: t('viewTable') },
            ]}
          />
        )}
      </div>
      {series.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-destructive-soft p-4 text-sm">
          <span>{t('error')}</span>
          <Button variant="secondary" onClick={series.retry}>{t('retry')}</Button>
        </div>
      ) : points === undefined ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">{t('loading')}</p>
          <Skeleton shape="block" className="h-64" />
          <LoadingNote />
        </div>
      ) : isEmpty ? (
        <p data-testid="chart-empty" className="py-10 text-center text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <Legend />
          {view === 'chart' ? <Columns points={points} /> : <SeriesTable points={points} />}
        </>
      )}
    </Card>
  );
}
