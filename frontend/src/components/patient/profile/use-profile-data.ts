'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { useAppointments } from '@/components/appointments/use-appointments';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import { isApiError } from '@/lib/api/api-fetch';
import { errorCodeToUx } from '@/lib/api/error-code-map';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { HISTORY_PAGE_SIZE } from '../history-timeline';
import { PRESCRIPTIONS_PAGE_SIZE } from '../prescription-list';
import type { AccountProfile, HistoryEntry, PatientProfile, Prescription } from '../patient-types';
import { newestFinishedVisit } from './profile-recommendations';
import { useAccount, useMyHistory, useMyPrescriptions, usePatientProfile } from '../use-patient-queries';

const UPCOMING_PAGE_SIZE = 10;

export interface ProfileData {
  readonly account: UseQueryResult<AccountProfile>;
  readonly patient: UseQueryResult<PatientProfile>;
  readonly upcoming: UseQueryResult<PaginatedResponse<AppointmentView>>;
  readonly history: UseQueryResult<PaginatedResponse<HistoryEntry>>;
  readonly prescriptions: UseQueryResult<PaginatedResponse<Prescription>>;
}

export function useProfileData(): ProfileData {
  return {
    account: useAccount(),
    patient: usePatientProfile(),
    upcoming: useAppointments({ tab: 'upcoming', page: 1, pageSize: UPCOMING_PAGE_SIZE }),
    history: useMyHistory({ page: 1, pageSize: HISTORY_PAGE_SIZE }),
    prescriptions: useMyPrescriptions({ page: 1, pageSize: PRESCRIPTIONS_PAGE_SIZE }),
  };
}

export function isNoCard(patient: UseQueryResult<PatientProfile>): boolean {
  return patient.isError && isApiError(patient.error) && errorCodeToUx(patient.error.problem.errorCode).kind === 'not-found';
}

export interface Count {
  readonly value: number;
  readonly more: boolean;
}

export function countOf<TItem>(page: PaginatedResponse<TItem> | undefined, predicate: (item: TItem) => boolean): Count | null {
  return page === undefined ? null : { value: page.items.filter(predicate).length, more: page.meta.totalPages > 1 };
}

export function activeAppointments(page: PaginatedResponse<AppointmentView> | undefined): ReadonlyArray<AppointmentView> {
  return (page?.items ?? []).filter((item) => item.status === 'booked');
}

export function newestFinished(page: PaginatedResponse<HistoryEntry> | undefined): HistoryEntry | undefined {
  return newestFinishedVisit(page?.items ?? []);
}
