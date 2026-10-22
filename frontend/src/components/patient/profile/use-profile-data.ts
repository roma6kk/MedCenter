'use client';

/**
 * use-profile-data — the five reads the profile page needs, composed without a new request: the account and the card, the
 * nearest appointments, the latest visits and the prescriptions. Each stays its own query result so a block can fail or
 * load on its own. Pages and keys are the ones the list pages already use, so a visit to them warms this page's cache.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { useAppointments } from '@/components/appointments/use-appointments';
import type { AppointmentView } from '@/components/appointments/appointment-types';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { HISTORY_PAGE_SIZE } from '../history-timeline';
import { PRESCRIPTIONS_PAGE_SIZE } from '../prescription-list';
import type { AccountProfile, HistoryEntry, PatientProfile, Prescription } from '../patient-types';
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

/** A count of what the loaded page holds; `more` when the list has further pages, so the number is "at least". */
export interface Count {
  readonly value: number;
  readonly more: boolean;
}

export function countOf<TItem>(page: PaginatedResponse<TItem> | undefined, predicate: (item: TItem) => boolean): Count | null {
  return page === undefined ? null : { value: page.items.filter(predicate).length, more: page.meta.totalPages > 1 };
}

/** The booked ones among the upcoming list (it also holds cancelled appointments, API 6.2). */
export function activeAppointments(page: PaginatedResponse<AppointmentView> | undefined): ReadonlyArray<AppointmentView> {
  return (page?.items ?? []).filter((item) => item.status === 'booked');
}

export function newestFinished(page: PaginatedResponse<HistoryEntry> | undefined): HistoryEntry | undefined {
  return [...(page?.items ?? [])].filter((entry) => entry.status === 'finished').sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
}
