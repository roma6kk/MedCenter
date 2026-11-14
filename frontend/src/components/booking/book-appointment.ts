import { apiFetch } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import type { BookingDraft } from '@/store/use-booking-draft-store';

interface CreateAppointmentRequest {
  readonly slotId: string;
  readonly serviceId?: string;
}

export interface AppointmentCreated {
  readonly id: string;
  readonly status: string;
  readonly start: string;
  readonly end: string;
}

export function buildBookingRequest(draft: Pick<BookingDraft, 'slotId' | 'serviceId'>): CreateAppointmentRequest | null {
  if (draft.slotId === null) return null;
  return {
    slotId: draft.slotId,
    ...(draft.serviceId === null ? {} : { serviceId: draft.serviceId }),
  };
}

export function bookAppointment(request: CreateAppointmentRequest, idempotencyKey: string): Promise<AppointmentCreated> {
  return apiFetch<AppointmentCreated>('/api/v1/appointments', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(request),
  });
}

export type BookingFailure = 'conflict' | 'gone' | 'mismatch' | 'other';

function mentions(problem: ProblemDetails, field: string): boolean {
  return (problem.details ?? []).some((item) => item.field === field) || (problem.detail ?? '').includes(field);
}

export function classifyBookingFailure(problem: ProblemDetails): BookingFailure {
  if (problem.errorCode === 'SLOT_CONFLICT') return 'conflict';
  if (problem.errorCode === 'NOT_FOUND' || problem.errorCode === 'COMPARTMENT_VIOLATION') return 'gone';
  if (problem.errorCode !== 'VALIDATION_ERROR') return 'other';
  if (mentions(problem, 'serviceId')) return 'mismatch';
  return mentions(problem, 'slotId') ? 'gone' : 'other';
}
