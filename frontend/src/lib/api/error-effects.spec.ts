import { effectsFor } from './error-effects';
import { ERROR_CODES, type ErrorCode, type ProblemDetails } from './problem';
import { networkProblem } from './problem-parse';

function problem(errorCode: ErrorCode, extra: Partial<ProblemDetails> = {}): ProblemDetails {
  return { title: 't', status: 409, errorCode, ...extra };
}

describe('effectsFor (mutation)', () => {
  it('should toast and refetch slots on SLOT_CONFLICT (BR-001)', () => {
    expect(effectsFor(problem('SLOT_CONFLICT'))).toEqual({
      toast: { tone: 'info', messageKey: 'errors.SLOT_CONFLICT' },
      invalidate: [['slots']],
    });
  });

  it('should refetch the appointment without a toast on APPOINTMENT_NOT_CANCELLABLE (BR-002)', () => {
    const effects = effectsFor(problem('APPOINTMENT_NOT_CANCELLABLE'));

    expect(effects.toast).toBeNull();
    expect(effects.invalidate).toEqual([['appointments'], ['appointment']]);
  });

  it('should refetch the encounter on ENCOUNTER_STATE_INVALID so the form turns read-only (BR-003/008)', () => {
    expect(effectsFor(problem('ENCOUNTER_STATE_INVALID')).invalidate).toEqual([['encounter'], ['doctorAppointments']]);
  });

  it.each(['CONSENT_REQUIRED', 'CONSENT_ALREADY_ACTIVE'] as const)('should refetch the consent status without a toast on %s (it was stale)', (code) => {
    expect(effectsFor(problem(code))).toEqual({ toast: null, invalidate: [['consent']] });
  });

  it('should toast the wait time when RATE_LIMITED carries Retry-After', () => {
    expect(effectsFor(problem('RATE_LIMITED', { status: 429, retryAfter: 30 })).toast).toEqual({
      tone: 'error',
      messageKey: 'errors.RATE_LIMITED_RETRY',
      values: { seconds: 30 },
    });
  });

  it('should toast the plain message when RATE_LIMITED has no Retry-After', () => {
    expect(effectsFor(problem('RATE_LIMITED', { status: 429 })).toast).toEqual({ tone: 'error', messageKey: 'errors.RATE_LIMITED' });
  });

  it('should toast a lost connection for a request that got no response', () => {
    expect(effectsFor(networkProblem()).toast).toEqual({ tone: 'error', messageKey: 'errors.NETWORK' });
  });

  it.each(ERROR_CODES.filter((code) => !['SLOT_CONFLICT', 'APPOINTMENT_NOT_CANCELLABLE', 'ENCOUNTER_STATE_INVALID', 'RATE_LIMITED', 'CONSENT_REQUIRED', 'CONSENT_ALREADY_ACTIVE'].includes(code)))(
    'should have no global side effect for %s (the screen owns its UX)',
    (code) => {
      expect(effectsFor(problem(code))).toEqual({ toast: null, invalidate: [] });
    },
  );
});

describe('effectsFor (query)', () => {
  it('should not invalidate anything from a failing query because a refetch could loop', () => {
    expect(effectsFor(problem('ENCOUNTER_STATE_INVALID'), 'query')).toEqual({ toast: null, invalidate: [] });
    expect(effectsFor(problem('SLOT_CONFLICT'), 'query')).toEqual({ toast: null, invalidate: [] });
  });

  it('should not toast a lost connection for a background poll', () => {
    expect(effectsFor(networkProblem(), 'query').toast).toBeNull();
  });

  it('should still toast a rate limit', () => {
    expect(effectsFor(problem('RATE_LIMITED', { status: 429 }), 'query').toast).not.toBeNull();
  });
});
