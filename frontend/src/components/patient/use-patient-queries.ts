'use client';

/** Read hooks of the patient's own record (history, prescriptions, account, FHIR profile), keyed per §5.1 (`'me'`, not an id). */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/api-fetch';
import { invalidateFor } from '@/lib/api/invalidation';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { queryKeys } from '@/lib/api/query-keys';
import { showToast } from '@/lib/ui/toast';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile, updateMyPhone, type PhoneChange } from './patient-api';
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

/**
 * 3.12 — resolves after the refreshed card is back, so a form that closes on success shows the new number. A 409 means the
 * card changed under the form: the card is reloaded too (its new `version` is what the next save sends), and the caller
 * tells the patient.
 */
export function useUpdateMyPhone(): UseMutationResult<PatientProfile, Error, PhoneChange> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: PhoneChange) => updateMyPhone(change),
    onSuccess: async () => {
      await invalidateFor(client, 'update-contact');
      showToast('success', 'patientProfile.data.phoneSaved');
    },
    onError: async (error: Error) => {
      if (isApiError(error) && error.errorCode === 'CONFLICT') await invalidateFor(client, 'update-contact');
    },
  });
}
