'use client';

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/api-fetch';
import { invalidateFor } from '@/lib/api/invalidation';
import { showToast } from '@/lib/ui/toast';
import { postCompleteEncounter, postNoshow, postOpenEncounter, type CompleteEncounterBody } from './doctor-api';
import type { EncounterSummary } from './doctor-types';
import { findFinishedEncounterId } from './find-finished-encounter';

export interface OpenEncounterInput {
  readonly appointmentId: string;
  readonly patientId: string;
  readonly emergencyReason?: string;
}

export function useNoshow(onRecorded?: () => void): UseMutationResult<unknown, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) => postNoshow(appointmentId),
    onSuccess: async () => {
      showToast('success', 'doctor.noshow.done');
      onRecorded?.();
      await invalidateFor(client, 'noshow');
    },
    // A 409 means the journal is behind the service: refresh it.
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await invalidateFor(client, 'noshow');
    },
  });
}

export function useOpenEncounter(): UseMutationResult<string, Error, OpenEncounterInput> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ appointmentId, patientId, emergencyReason }: OpenEncounterInput): Promise<string> => {
      try {
        return (await postOpenEncounter(appointmentId, emergencyReason)).id;
      } catch (error: unknown) {
        if (!(error instanceof ApiError) || error.errorCode !== 'ENCOUNTER_STATE_INVALID') throw error;
        const finishedId: string | null = await findFinishedEncounterId(patientId, appointmentId).catch(() => null);
        if (finishedId === null) throw error;
        return finishedId;
      }
    },
    onSuccess: () => {
      void invalidateFor(client, 'open-encounter');
    },
  });
}

export function useCompleteEncounter(encounterId: string, onCompleted?: () => void): UseMutationResult<EncounterSummary, Error, CompleteEncounterBody> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: CompleteEncounterBody) => postCompleteEncounter(encounterId, values),
    onSuccess: async () => {
      // Before `mutate`'s own callback: the refresh below unmounts the form, and a callback never runs after unmount (the draft would outlive the visit).
      onCompleted?.();
      showToast('success', 'doctor.encounter.completedToast');
      await invalidateFor(client, 'complete-encounter');
    },
  });
}
