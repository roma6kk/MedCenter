'use client';

/**
 * use-doctor-mutations — the writes of the doctor area. Each one invalidates the cached reads it makes stale through the
 * shared table (`invalidateFor`, frontend-design-spec §5.1); the central QueryClient adds the errorCode side effects.
 */
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
  /** Why the encounter is opened without the patient's consent (emergency care, 10…500 characters); sent only after a 409 `CONSENT_REQUIRED`. */
  readonly emergencyReason?: string;
}

/**
 * BR-008 turned into a button: marks a booked appointment as a no-show (API 6.6).
 * `onRecorded` runs right after the answer and before the journal refreshes: that is the last moment the pressed button still
 * exists, so it is where focus can be handed on (the refresh removes the booked-only actions from the row).
 */
export function useNoshow(onRecorded?: () => void): UseMutationResult<unknown, Error, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) => postNoshow(appointmentId),
    onSuccess: async () => {
      showToast('success', 'doctor.noshow.done');
      onRecorded?.();
      await invalidateFor(client, 'noshow');
    },
    // A 409 means the journal is behind the service (the visit was seen or changed elsewhere): refresh it to show why.
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await invalidateFor(client, 'noshow');
    },
  });
}

/**
 * Opens (or re-enters) the encounter of a booked appointment and resolves its id (API 7.1). When the appointment already has
 * a finished encounter the service answers 409; the id of that finished record is then looked up in the history instead.
 */
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
    // Not awaited: the doctor goes to the encounter at once; the journal behind refreshes on its own.
    onSuccess: () => {
      void invalidateFor(client, 'open-encounter');
    },
  });
}

/** Completes the encounter with one atomic body (API 7.3). A replay is a 409 the form turns into the read-only view. */
export function useCompleteEncounter(encounterId: string): UseMutationResult<EncounterSummary, Error, CompleteEncounterBody> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: CompleteEncounterBody) => postCompleteEncounter(encounterId, values),
    onSuccess: async () => {
      showToast('success', 'doctor.encounter.completedToast');
      await invalidateFor(client, 'complete-encounter');
    },
  });
}
