'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import { queryKeys } from '@/lib/api/query-keys';
import { withQuery } from '@/lib/api/query-string';
import type { ReportRange } from '../shared/report-range';
import type { AppointmentsReport, MeasureReport } from './analytics-types';

const BASE = '/api/v1/admin/analytics';

/** 9.1 — booked / cancelled / no-show in the period. */
export function useAppointmentsReport(range: ReportRange): UseQueryResult<AppointmentsReport, Error> {
  return useQuery({
    queryKey: queryKeys.analytics('appointments', { ...range }),
    queryFn: () => apiFetch<AppointmentsReport>(withQuery(`${BASE}/appointments`, { ...range })),
  });
}

/** 9.2 — completed encounters by the practitioner's specialty. */
export function useEncountersReport(range: ReportRange): UseQueryResult<MeasureReport, Error> {
  return useQuery({
    queryKey: queryKeys.analytics('encounters', { ...range }),
    queryFn: () => apiFetch<MeasureReport>(withQuery(`${BASE}/encounters`, { ...range })),
  });
}

/** 9.3 — the `top` most booked services of the period. */
export function useServicesPopularity(range: ReportRange, top: number): UseQueryResult<MeasureReport, Error> {
  return useQuery({
    queryKey: queryKeys.analytics('services-popularity', { ...range, top }),
    queryFn: () => apiFetch<MeasureReport>(withQuery(`${BASE}/services-popularity`, { ...range, top })),
  });
}
