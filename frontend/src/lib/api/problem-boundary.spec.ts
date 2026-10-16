import { errorCodeToUx, ERROR_CODES, type ErrorCode } from './problem';

const EXPECTED_UX: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'field-errors',
  UNAUTHENTICATED: 'silent-refresh',
  TOKEN_REVOKED: 'logout-toast',
  FORBIDDEN_SCOPE: 'forbidden',
  FORBIDDEN_ROLE: 'forbidden',
  COMPARTMENT_VIOLATION: 'not-found',
  NOT_FOUND: 'not-found',
  METHOD_NOT_ALLOWED: 'banner-generic',
  CONFLICT: 'banner-generic',
  SLOT_CONFLICT: 'slot-conflict',
  APPOINTMENT_NOT_CANCELLABLE: 'appointment-refresh',
  ENCOUNTER_STATE_INVALID: 'encounter-readonly',
  SCHEDULE_OVERLAP: 'schedule-highlight',
  SCHEDULE_IN_USE: 'in-use-conflict',
  ROOM_IN_USE: 'in-use-conflict',
  SERVICE_IN_USE: 'in-use-conflict',
  INVALID_ICD10_CODE: 'focus-icd10',
  TERMINOLOGY_NOT_FOUND: 'focus-terminology',
  RATE_LIMITED: 'rate-limit-toast',
  INTERNAL: 'internal-banner',
};

describe('errorCodeToUx full catalog', () => {
  it('should expose exactly 20 catalogue codes', () => {
    expect(ERROR_CODES).toHaveLength(20);
  });

  it.each(Object.entries(EXPECTED_UX))('should map %s to %s', (code, kind) => {
    expect(errorCodeToUx(code as ErrorCode)).toEqual(expect.objectContaining({ kind }));
  });

  it('should hide compartment violations as 404 (no oracle for patient IDs)', () => {
    expect(errorCodeToUx('COMPARTMENT_VIOLATION')).toEqual(errorCodeToUx('NOT_FOUND'));
  });

  it('should surface TOKEN_REVOKED as a logout toast', () => {
    expect(errorCodeToUx('TOKEN_REVOKED')).toEqual({ kind: 'logout-toast' });
  });
});
