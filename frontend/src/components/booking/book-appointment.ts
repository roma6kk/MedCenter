import { apiFetch } from '@/lib/api/api-fetch';
import { groupFieldErrors } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import type { BookingDraft } from '@/store/use-booking-draft-store';

export const REASON_MIN = 3;
export const REASON_MAX = 500;

interface CreateAppointmentRequest {
  readonly slotId: string;
  readonly serviceId?: string;
  readonly reason?: string;
}

export interface AppointmentCreated {
  readonly id: string;
  readonly status: string;
  readonly start: string;
  readonly end: string;
}

type ReasonProblem = 'tooShort' | 'tooLong';

export function reasonProblem(reason: string): ReasonProblem | null {
  const length: number = reason.trim().length;
  if (length === 0) return null;
  if (length < REASON_MIN) return 'tooShort';
  return length > REASON_MAX ? 'tooLong' : null;
}

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

export type BookingFailure = 'conflict' | 'gone' | 'mismatch' | 'reason' | 'consent' | 'other';

function mentions(problem: ProblemDetails, field: string): boolean {
  return (problem.details ?? []).some((item) => item.field === field) || (problem.detail ?? '').includes(field);
}

export function classifyBookingFailure(problem: ProblemDetails): BookingFailure {
  if (problem.errorCode === 'SLOT_CONFLICT') return 'conflict';
  if (problem.errorCode === 'NOT_FOUND' || problem.errorCode === 'COMPARTMENT_VIOLATION') return 'gone';
  if (problem.errorCode === 'CONSENT_REQUIRED') return 'consent';
  if (problem.errorCode !== 'VALIDATION_ERROR') return 'other';
  if (mentions(problem, 'serviceId')) return 'mismatch';
  if (mentions(problem, 'slotId')) return 'gone';
  return mentions(problem, 'reason') ? 'reason' : 'other';
}

export function serverReasonMessage(problem: ProblemDetails): string | null {
  const messages: ReadonlyArray<string> = groupFieldErrors(problem.details)['reason'] ?? [];
  return messages.length === 0 ? null : messages.join('. ');
}
