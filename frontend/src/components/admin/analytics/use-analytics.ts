'use client';

import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import type { ReportRange } from '../shared/report-range';
import { statusCounts } from './analytics-math';
import type { Bucket } from './analytics-series';
import type { AppointmentStatusCode, AppointmentsReport, MeasureReport } from './analytics-types';

const BASE = '/api/v1/admin/analytics';

// Only `from` and `to` go to the server: a chart column is a `Bucket`, which carries more, and the API refuses unknown parameters.
function appointmentsQuery({ from, to }: ReportRange): { readonly queryKey: ReturnType<typeof queryKeys.analytics>; readonly queryFn: () => Promise<AppointmentsReport> } {
  return {
    queryKey: queryKeys.analytics('appointments', { from, to }),
    queryFn: () => apiFetch<AppointmentsReport>(withQuery(`${BASE}/appointments`, { from, to })),
  };
}

export function useAppointmentsReport(range: ReportRange): UseQueryResult<AppointmentsReport, Error> {
  return useQuery(appointmentsQuery(range));
}

export interface SeriesPoint {
  readonly bucket: Bucket;
  readonly counts: Readonly<Record<AppointmentStatusCode, number>>;
}

export interface AppointmentSeries {
  readonly points: ReadonlyArray<SeriesPoint> | undefined;
  readonly isError: boolean;
  readonly retry: () => void;
}

export function useAppointmentSeries(buckets: ReadonlyArray<Bucket>, enabled: boolean): AppointmentSeries {
  const results = useQueries({ queries: buckets.map((bucket) => ({ ...appointmentsQuery(bucket), enabled })) });
  const reports: ReadonlyArray<AppointmentsReport | undefined> = results.map((result) => result.data);
  const points: ReadonlyArray<SeriesPoint> | undefined = reports.every((report) => report !== undefined)
    ? buckets.map((bucket, index) => ({ bucket, counts: statusCounts(reports[index] as AppointmentsReport) }))
    : undefined;
  const failed = results.filter((result) => result.isError);
  const retry = (): void => failed.forEach((result) => void result.refetch());
  return { points, isError: failed.length > 0, retry };
}

export function useEncountersReport(range: ReportRange): UseQueryResult<MeasureReport, Error> {
  return useQuery({
    queryKey: queryKeys.analytics('encounters', { ...range }),
    queryFn: () => apiFetch<MeasureReport>(withQuery(`${BASE}/encounters`, { ...range })),
  });
}

export function useServicesPopularity(range: ReportRange, top: number): UseQueryResult<MeasureReport, Error> {
  return useQuery({
    queryKey: queryKeys.analytics('services-popularity', { ...range, top }),
    queryFn: () => apiFetch<MeasureReport>(withQuery(`${BASE}/services-popularity`, { ...range, top })),
  });
}
