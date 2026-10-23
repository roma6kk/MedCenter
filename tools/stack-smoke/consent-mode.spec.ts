import { modeFromAnswer, reconcileMode } from './consent-mode';
import type { ApiResponse } from './smoke-types';

const answer = (status: number, body: unknown = undefined): ApiResponse => ({ status, contentType: 'application/json', text: '', body });

describe('modeFromAnswer', () => {
  it('should read block from the 409 CONSENT_REQUIRED that a booking with a reason gets without consent', () => {
    expect(modeFromAnswer(answer(409, { errorCode: 'CONSENT_REQUIRED' }))).toBe('block');
  });

  it('should read warn from a 201: the stack booked without the reason instead of refusing', () => {
    expect(modeFromAnswer(answer(201, { id: 'a1' }))).toBe('warn');
  });

  it.each([
    [409, { errorCode: 'SLOT_CONFLICT' }],
    [401, { errorCode: 'UNAUTHENTICATED' }],
    [500, undefined],
  ])('should not guess the mode from HTTP %s %j', (status, body) => {
    expect(() => modeFromAnswer(answer(status, body))).toThrow(/cannot tell CONSENT_ENFORCEMENT/);
  });
});

describe('reconcileMode', () => {
  it('should take the detected mode when none is configured, and the configured one when it agrees', () => {
    expect(reconcileMode(undefined, 'block')).toBe('block');
    expect(reconcileMode('warn', 'warn')).toBe('warn');
  });

  it('should fail loudly when the stack runs another mode than SMOKE_CONSENT_ENFORCEMENT says', () => {
    expect(() => reconcileMode('block', 'warn')).toThrow('SMOKE_CONSENT_ENFORCEMENT=block, but the stack behaves as warn');
  });
});
