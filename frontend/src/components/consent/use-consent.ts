'use client';

/**
 * use-consent — TanStack Query hooks of the consent to the electronic record (ADR-019): reads of the own and of a patient's
 * consent, and the writes staff and the patient make. Every write refreshes all consent views through the shared table.
 */
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

/** `GET /me/consent` (3.4): status and history of the caller. */
export function useMyConsent(): UseQueryResult<PatientConsent> {
  return useQuery({ queryKey: queryKeys.myConsent, queryFn: ({ signal }) => fetchMyConsent(signal), staleTime: DEFAULT_STALE_TIME_MS });
}

/** `GET /patients/{id}/consent` (3.7): for ADMIN and for a DOCTOR linked to the patient. */
export function usePatientConsent(patientId: string): UseQueryResult<PatientConsent> {
  return useQuery({
    queryKey: queryKeys.patientConsent(patientId),
    queryFn: ({ signal }) => fetchPatientConsent(patientId, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

/** `POST /me/consent/revoke` (3.6): the patient's own revocation. */
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

/**
 * Records a paper consent or a written refusal: the scan is uploaded (3.10), then the entry is created with its id (3.8).
 * A scan that was uploaded and whose entry was then refused (a 409, a field error) is not uploaded again when the same file
 * is sent once more: the upload is remembered per file.
 */
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

/** `POST /patients/{id}/consent/revoke` (3.9): a written revocation entered by staff. */
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
