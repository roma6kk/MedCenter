'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
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

/** Why the wizard sent the visitor back to the slot step. */
export type BookingNotice = 'conflict' | 'gone' | 'mismatch';

interface Outcome {
  readonly notice: BookingNotice | null;
  /** The slot the server refused, drawn as taken by the picker. */
  readonly takenSlot: Slot | null;
  /** A failure that keeps the visitor on the confirmation step; the same request can be sent again. */
  readonly problem: ProblemDetails | null;
  /** The server's words about the reason field. */
  readonly reasonError: string | null;
}

const NO_OUTCOME: Outcome = { notice: null, takenSlot: null, problem: null, reasonError: null };

export interface BookingSubmit extends Outcome {
  readonly submit: () => void;
  readonly isPending: boolean;
  readonly created: AppointmentCreated | null;
  /** Forget the last refusal (the visitor changed a choice). */
  readonly reset: () => void;
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
    case 'reason': {
      const reasonError: string | null = serverReasonMessage(problem);
      return reasonError === null ? { ...NO_OUTCOME, problem } : { ...NO_OUTCOME, reasonError };
    }
    default:
      return { ...NO_OUTCOME, problem };
  }
}

/** A refused slot cannot be booked again: it (and the key of that intent) leaves the draft, the wizard goes back to the slot step. */
function releaseIfRefused(failure: BookingFailure): void {
  if (failure === 'conflict' || failure === 'gone' || failure === 'mismatch') useBookingDraftStore.getState().releaseSlot();
}

/** Sends the request of the current draft under the key of its intent. */
function sendDraft(): Promise<AppointmentCreated> {
  const draft = useBookingDraftStore.getState();
  const request = buildBookingRequest(draft);
  if (request === null) return Promise.reject(new Error('A booking needs a chosen slot'));
  return bookAppointment(request, draft.ensureIdempotencyKey());
}

/** Reads a refused booking: what the wizard shows for it, and which kind of refusal it was. */
function readFailure(error: unknown): { readonly outcome: Outcome; readonly failure: BookingFailure } {
  const problem: ProblemDetails = isApiError(error) ? error.problem : networkProblem();
  const failure: BookingFailure = classifyBookingFailure(problem);
  const taken: Slot | null = takenFrom(useBookingDraftStore.getState());
  return { outcome: outcomeFor(failure, problem, taken), failure };
}

/**
 * `POST /api/v1/appointments` for the draft. One `Idempotency-Key` per intent: the draft store creates it on the first
 * attempt and every retry of the same request reuses it; a refused slot or an edited request starts a new intent.
 */
export function useBookingSubmit(): BookingSubmit {
  const client = useQueryClient();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>(NO_OUTCOME);
  const mutation = useMutation({
    mutationFn: sendDraft,
    onMutate: () => setOutcome(NO_OUTCOME),
    onSuccess: (created) => {
      useBookingDraftStore.getState().clearDraft();
      void invalidateFor(client, 'booking');
      router.push(`/appointments/${encodeURIComponent(created.id)}`);
    },
    onError: (error: unknown) => {
      const { outcome: refused, failure } = readFailure(error);
      // The notice must be on screen before the draft moves the wizard to the slot step: the step change then knows
      // it is a refusal (its alert is announced; focus is not moved).
      flushSync(() => setOutcome(refused));
      releaseIfRefused(failure);
    },
  });
  return {
    ...outcome,
    submit: () => mutation.mutate(),
    isPending: mutation.isPending,
    created: mutation.data ?? null,
    reset: () => setOutcome(NO_OUTCOME),
  };
}
