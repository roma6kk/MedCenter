'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Slot } from '@/components/catalog/catalog-types';
import { isApiError } from '@/lib/api/api-fetch';
import { invalidateFor } from '@/lib/api/invalidation';
import type { ProblemDetails } from '@/lib/api/problem';
import { networkProblem } from '@/lib/api/problem-parse';
import { useBookingDraftStore, type BookingDraft } from '@/store/use-booking-draft-store';
import {
  bookAppointment,
  buildBookingRequest,
  classifyBookingFailure,
  serverReasonMessage,
  type AppointmentCreated,
  type BookingFailure,
} from './book-appointment';
import { repairDraft } from './booking-steps';

export type BookingNotice = 'conflict' | 'gone' | 'mismatch' | 'expired';

interface Outcome {
  readonly notice: BookingNotice | null;
  readonly takenSlot: Slot | null;
  readonly problem: ProblemDetails | null;
  readonly reasonError: string | null;
  readonly consentRefused: boolean;
}

const NO_OUTCOME: Outcome = { notice: null, takenSlot: null, problem: null, reasonError: null, consentRefused: false };

export interface BookedVisit extends AppointmentCreated {
  readonly doctorId: string | null;
  readonly serviceId: string | null;
}

export interface BookingSubmit extends Outcome {
  readonly submit: () => void;
  readonly isPending: boolean;
  readonly created: BookedVisit | null;
  readonly reset: () => void;
  readonly startOver: () => void;
}

function takenFrom(draft: BookingDraft): Slot | null {
  if (draft.slotId === null || draft.slotStart === null || draft.slotEnd === null) return null;
  return { id: draft.slotId, start: draft.slotStart, end: draft.slotEnd, status: 'busy' };
}

function outcomeFor(failure: BookingFailure, problem: ProblemDetails, taken: Slot | null): Outcome {
  switch (failure) {
    case 'conflict':
      return { ...NO_OUTCOME, notice: 'conflict', takenSlot: taken };
    case 'gone':
      return { ...NO_OUTCOME, notice: 'gone', takenSlot: taken };
    case 'mismatch':
      return { ...NO_OUTCOME, notice: 'mismatch' };
    case 'consent':
      return { ...NO_OUTCOME, consentRefused: true };
    case 'reason': {
      const reasonError: string | null = serverReasonMessage(problem);
      return reasonError === null ? { ...NO_OUTCOME, problem } : { ...NO_OUTCOME, reasonError };
    }
    default:
      return { ...NO_OUTCOME, problem };
  }
}

function releaseIfRefused(failure: BookingFailure): void {
  if (failure === 'conflict' || failure === 'gone' || failure === 'mismatch') useBookingDraftStore.getState().releaseSlot();
}

async function sendDraft(): Promise<BookedVisit> {
  const draft = useBookingDraftStore.getState();
  const request = buildBookingRequest(draft);
  if (request === null) throw new Error('A booking needs a chosen slot');
  const created: AppointmentCreated = await bookAppointment(request, draft.ensureIdempotencyKey());
  return { ...created, doctorId: draft.doctorId, serviceId: draft.serviceId };
}

function readFailure(error: unknown): { readonly outcome: Outcome; readonly failure: BookingFailure } {
  const problem: ProblemDetails = isApiError(error) ? error.problem : networkProblem();
  const failure: BookingFailure = classifyBookingFailure(problem);
  const taken: Slot | null = takenFrom(useBookingDraftStore.getState());
  return { outcome: outcomeFor(failure, problem, taken), failure };
}

/** One `Idempotency-Key` per intent: created on the first attempt, reused by every retry; a refused slot or an edit starts a new one. */
export function useBookingSubmit(): BookingSubmit {
  const client = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome>(NO_OUTCOME);
  const mutation = useMutation({
    mutationFn: sendDraft,
    onMutate: () => setOutcome((last) => ({ ...NO_OUTCOME, consentRefused: last.consentRefused })),
    onSuccess: () => {
      useBookingDraftStore.getState().clearDraft();
      void invalidateFor(client, 'booking');
    },
    onError: (error: unknown) => {
      const { outcome: refused, failure } = readFailure(error);
      // a refusal: its alert is announced, focus is not moved.
      flushSync(() => setOutcome(refused));
      releaseIfRefused(failure);
    },
  });
  return {
    ...outcome,
    submit: () => {
      const repair = repairDraft(useBookingDraftStore.getState());
      if (repair !== null && 'slotId' in repair) {
        flushSync(() => setOutcome({ ...NO_OUTCOME, notice: 'expired' }));
        useBookingDraftStore.getState().releaseSlot();
        return;
      }
      mutation.mutate();
    },
    isPending: mutation.isPending,
    created: mutation.data ?? null,
    reset: () => setOutcome(NO_OUTCOME),
    startOver: () => {
      mutation.reset();
      setOutcome(NO_OUTCOME);
    },
  };
}
