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

/** Why the wizard sent the visitor back to the slot step. */
export type BookingNotice = 'conflict' | 'gone' | 'mismatch' | 'expired';

interface Outcome {
  readonly notice: BookingNotice | null;
  /** The slot the server refused, drawn as taken by the picker. */
  readonly takenSlot: Slot | null;
  /** A failure that keeps the visitor on the confirmation step; the same request can be sent again. */
  readonly problem: ProblemDetails | null;
  /** The server's words about the reason field. */
  readonly reasonError: string | null;
  /** 409 CONSENT_REQUIRED: the record has no consent, so the reason (free text about health) cannot be taken; the visit can be booked without it. */
  readonly consentRefused: boolean;
}

const NO_OUTCOME: Outcome = { notice: null, takenSlot: null, problem: null, reasonError: null, consentRefused: false };

/**
 * The booking the server created, with what the draft held when it was sent: the draft is cleared on success, and the
 * success screen still names the doctor and the service from the catalogue entries the wizard has cached.
 */
export interface BookedVisit extends AppointmentCreated {
  readonly doctorId: string | null;
  readonly serviceId: string | null;
}

export interface BookingSubmit extends Outcome {
  readonly submit: () => void;
  readonly isPending: boolean;
  readonly created: BookedVisit | null;
  /** Forget the last refusal (the visitor changed a choice). */
  readonly reset: () => void;
  /** Leave the success screen for a fresh wizard: the next booking starts from an empty draft. */
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

/** A refused slot cannot be booked again: it (and the key of that intent) leaves the draft, the wizard goes back to the slot step. */
function releaseIfRefused(failure: BookingFailure): void {
  if (failure === 'conflict' || failure === 'gone' || failure === 'mismatch') useBookingDraftStore.getState().releaseSlot();
}

/** Sends the request of the current draft under the key of its intent. */
async function sendDraft(): Promise<BookedVisit> {
  const draft = useBookingDraftStore.getState();
  const request = buildBookingRequest(draft);
  if (request === null) throw new Error('A booking needs a chosen slot');
  const created: AppointmentCreated = await bookAppointment(request, draft.ensureIdempotencyKey());
  return { ...created, doctorId: draft.doctorId, serviceId: draft.serviceId };
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
  const [outcome, setOutcome] = useState<Outcome>(NO_OUTCOME);
  const mutation = useMutation({
    mutationFn: sendDraft,
    // The refusal for the consent stays: the reason field stays closed until the visitor changes a choice.
    onMutate: () => setOutcome((last) => ({ ...NO_OUTCOME, consentRefused: last.consentRefused })),
    onSuccess: () => {
      useBookingDraftStore.getState().clearDraft();
      void invalidateFor(client, 'booking');
      // The wizard shows the success screen from `created`; the patient leaves it by choice (B1), so nothing navigates here.
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
    submit: () => {
      // A confirmation step left open past the start of the slot: the slot is dropped instead of sent (the server would refuse it, BR-001).
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
