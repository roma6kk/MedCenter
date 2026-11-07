'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { DEFAULT_STALE_TIME_MS } from '@/lib/api/query-config';
import { invalidateFor } from '@/lib/api/invalidation';
import { queryKeys } from '@/lib/api/query-keys';
import { showToast } from '@/lib/ui/toast';
import {
  fetchMyConsent,
  fetchPatientConsent,
  postConsentScan,
  postMyConsentRevoke,
  postPatientConsent,
  postPatientConsentRevoke,
} from './consent-api';
import type { ConsentEntry, ConsentRecord, PatientConsent, RevokeConsentBody, ScanUpload } from './consent-types';

export function useMyConsent(): UseQueryResult<PatientConsent> {
  return useQuery({ queryKey: queryKeys.myConsent, queryFn: ({ signal }) => fetchMyConsent(signal), staleTime: DEFAULT_STALE_TIME_MS });
}

export function usePatientConsent(patientId: string): UseQueryResult<PatientConsent> {
  return useQuery({
    queryKey: queryKeys.patientConsent(patientId),
    queryFn: ({ signal }) => fetchPatientConsent(patientId, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useRevokeMyConsent(): UseMutationResult<ConsentRecord, Error, void> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => postMyConsentRevoke(),
    onSuccess: async () => {
      showToast('success', 'consent.mine.revoked');
      await invalidateFor(client, 'consent-change');
    },
  });
}

// A scan already uploaded is not uploaded again when the same file is resent after a refused entry (409, field error).
export function useRecordConsent(patientId: string): UseMutationResult<ConsentRecord, Error, ConsentEntry> {
  const client = useQueryClient();
  const uploaded = useRef<{ readonly file: File; readonly scan: ScanUpload } | null>(null);
  return useMutation({
    mutationFn: async ({ file, body }: ConsentEntry): Promise<ConsentRecord> => {
      if (uploaded.current?.file !== file) uploaded.current = { file, scan: await postConsentScan(patientId, file) };
      return postPatientConsent(patientId, { ...body, scanId: uploaded.current.scan.scanId });
    },
    onSuccess: async () => {
      uploaded.current = null;
      showToast('success', 'consent.staff.recorded');
      await invalidateFor(client, 'consent-change');
    },
  });
}

export function useRevokePatientConsent(patientId: string): UseMutationResult<ConsentRecord, Error, RevokeConsentBody> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RevokeConsentBody) => postPatientConsentRevoke(patientId, body),
    onSuccess: async () => {
      showToast('success', 'consent.staff.revoked');
      await invalidateFor(client, 'consent-change');
    },
  });
}
