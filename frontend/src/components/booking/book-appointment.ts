/**
 * book-appointment — the `POST /api/v1/appointments` call (api-designer-spec §6.1) and the reading of its failures.
 *
 * The body is `{ slotId, serviceId?, reason? }`; the patient is never part of it (ADR-013: the server takes it from the
 * token). One `Idempotency-Key` identifies one booking intent and is reused when the same request is sent again.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import { groupFieldErrors } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import type { BookingDraft } from '@/store/use-booking-draft-store';

export const REASON_MIN = 3;
export const REASON_MAX = 500;

export interface CreateAppointmentRequest {
  readonly slotId: string;
  readonly serviceId?: string;
  readonly reason?: string;
}

/** `AppointmentResponseDto` (§6.1): the wizard only needs the id to open the appointment. */
export interface AppointmentCreated {
  readonly id: string;
  readonly status: string;
  readonly start: string;
  readonly end: string;
}

export type ReasonProblem = 'tooShort' | 'tooLong';

/** The reason is optional; when given it is 3…500 characters after trimming (message keys `booking.reason*`). */
export function reasonProblem(reason: string): ReasonProblem | null {
  const length: number = reason.trim().length;
  if (length === 0) return null;
  if (length < REASON_MIN) return 'tooShort';
  return length > REASON_MAX ? 'tooLong' : null;
}

/** The request body of the draft, or `null` while no slot is chosen. A blank reason and "any service" are left out. */
export function buildBookingRequest(draft: Pick<BookingDraft, 'slotId' | 'serviceId' | 'reason'>): CreateAppointmentRequest | null {
  if (draft.slotId === null) return null;
  const reason: string = draft.reason.trim();
  return {
    slotId: draft.slotId,
    ...(draft.serviceId === null ? {} : { serviceId: draft.serviceId }),
    ...(reason === '' ? {} : { reason }),
  };
}

export function bookAppointment(request: CreateAppointmentRequest, idempotencyKey: string): Promise<AppointmentCreated> {
  return apiFetch<AppointmentCreated>('/api/v1/appointments', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(request),
  });
}

/**
 * - `conflict`: the slot was taken first (409 SLOT_CONFLICT, BR-001);
 * - `gone`: the slot does not exist any more (its schedule was removed);
 * - `mismatch`: the slot belongs to another service of the doctor (400, `serviceId` does not match its schedule);
 * - `reason`: the reason text was refused;
 * - `other`: anything else — shown as a banner, the same request can be retried.
 */
export type BookingFailure = 'conflict' | 'gone' | 'mismatch' | 'reason' | 'other';

function mentions(problem: ProblemDetails, field: string): boolean {
  return (problem.details ?? []).some((item) => item.field === field) || (problem.detail ?? '').includes(field);
}

export function classifyBookingFailure(problem: ProblemDetails): BookingFailure {
  if (problem.errorCode === 'SLOT_CONFLICT') return 'conflict';
  if (problem.errorCode === 'NOT_FOUND' || problem.errorCode === 'COMPARTMENT_VIOLATION') return 'gone';
  if (problem.errorCode !== 'VALIDATION_ERROR') return 'other';
  if (mentions(problem, 'serviceId')) return 'mismatch';
  if (mentions(problem, 'slotId')) return 'gone';
  return mentions(problem, 'reason') ? 'reason' : 'other';
}

/** The server's words about the reason field (already localized where a translation is known), if any. */
export function serverReasonMessage(problem: ProblemDetails): string | null {
  const messages: ReadonlyArray<string> = groupFieldErrors(problem.details)['reason'] ?? [];
  return messages.length === 0 ? null : messages.join('. ');
}
