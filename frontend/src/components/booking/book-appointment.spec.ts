jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { bookAppointment, buildBookingRequest, classifyBookingFailure, reasonProblem, serverReasonMessage } from './book-appointment';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function problem(overrides: Partial<ProblemDetails>): ProblemDetails {
  return { title: 'Error', status: 400, errorCode: 'VALIDATION_ERROR', ...overrides };
}

describe('reasonProblem', () => {
  it('should accept the booking when the reason is missing', () => {
    expect(reasonProblem('')).toBeNull();
    expect(reasonProblem('   ')).toBeNull();
  });

  it('should refuse a reason when it is shorter than three characters after trimming', () => {
    expect(reasonProblem(' ab ')).toBe('tooShort');
  });

  it('should accept a reason when it has three or five hundred characters', () => {
    expect(reasonProblem('abc')).toBeNull();
    expect(reasonProblem('x'.repeat(500))).toBeNull();
  });

  it('should refuse a reason when it has more than five hundred characters', () => {
    expect(reasonProblem('x'.repeat(501))).toBe('tooLong');
  });
});

describe('buildBookingRequest', () => {
  it('should be null when no slot is chosen yet', () => {
    expect(buildBookingRequest({ slotId: null, serviceId: null, reason: '' })).toBeNull();
  });

  it('should send only the slot when no service and no reason were given', () => {
    expect(buildBookingRequest({ slotId: 'slot-1', serviceId: null, reason: '  ' })).toEqual({ slotId: 'slot-1' });
  });

  it('should send the service and the trimmed reason when they were given', () => {
    expect(buildBookingRequest({ slotId: 'slot-1', serviceId: 'svc-1', reason: ' Болит спина ' })).toEqual({
      slotId: 'slot-1',
      serviceId: 'svc-1',
      reason: 'Болит спина',
    });
  });

  it('should not name a patient when the request body is built', () => {
    const body = buildBookingRequest({ slotId: 'slot-1', serviceId: null, reason: '' });

    expect(Object.keys(body ?? {})).not.toContain('patient');
  });
});

describe('bookAppointment', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should post the request with the idempotency key header when a booking is sent', async () => {
    apiFetchMock.mockResolvedValue({ id: 'appt-1' });

    await bookAppointment({ slotId: 'slot-1' }, 'key-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/appointments', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
      body: JSON.stringify({ slotId: 'slot-1' }),
    });
  });
});

describe('classifyBookingFailure', () => {
  it('should read the problem as a lost race when the code is SLOT_CONFLICT', () => {
    expect(classifyBookingFailure(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }))).toBe('conflict');
  });

  it('should read the problem as a vanished slot when the code is NOT_FOUND', () => {
    expect(classifyBookingFailure(problem({ status: 404, errorCode: 'NOT_FOUND' }))).toBe('gone');
  });

  it('should read the problem as a service mismatch when the server complains about serviceId', () => {
    const failure = problem({ detail: 'serviceId does not match the schedule of this slot' });

    expect(classifyBookingFailure(failure)).toBe('mismatch');
  });

  it('should read the problem as a field problem when the server complains about the reason', () => {
    const failure = problem({ details: [{ field: 'reason', message: 'reason must be longer than or equal to 3 characters' }] });

    expect(classifyBookingFailure(failure)).toBe('reason');
  });

  it('should read the problem as a missing slot when the server complains about the slot id', () => {
    const failure = problem({ details: [{ field: 'slotId', message: 'slotId must be a FHIR resource id' }] });

    expect(classifyBookingFailure(failure)).toBe('gone');
  });

  it('should treat the problem as retryable when it is anything else', () => {
    expect(classifyBookingFailure(problem({ status: 500, errorCode: 'INTERNAL' }))).toBe('other');
    expect(classifyBookingFailure(problem({ status: 400, detail: 'something' }))).toBe('other');
  });
});

describe('serverReasonMessage', () => {
  it('should hand back the localized server words when the problem names the reason field', () => {
    const failure = problem({ details: [{ field: 'reason', message: 'reason must be longer than or equal to 3 characters' }] });

    expect(serverReasonMessage(failure)).toBe('Слишком короткое значение');
  });

  it('should be null when the reason was not mentioned', () => {
    expect(serverReasonMessage(problem({}))).toBeNull();
  });
});
