'use client';

/** Read hooks of the patient's own record (history, prescriptions, account, FHIR profile), keyed per §5.1 (`'me'`, not an id). */
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from './patient-api';
import type { AccountProfile, HistoryEntry, PatientProfile, Prescription } from './patient-types';

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export function useMyHistory(request: PageRequest): UseQueryResult<PaginatedResponse<HistoryEntry>> {
  return useQuery({ queryKey: queryKeys.history('me', { ...request }), queryFn: () => fetchMyHistory(request), placeholderData: keepPreviousData });
}

export function useMyPrescriptions(request: PageRequest): UseQueryResult<PaginatedResponse<Prescription>> {
  return useQuery({ queryKey: queryKeys.prescriptions('me', { ...request }), queryFn: () => fetchMyPrescriptions(request), placeholderData: keepPreviousData });
}

export function useAccount(): UseQueryResult<AccountProfile> {
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => fetchAccount() });
}

export function usePatientProfile(): UseQueryResult<PatientProfile> {
  return useQuery({ queryKey: queryKeys.patientProfile, queryFn: () => fetchPatientProfile() });
}
