import { APPOINTMENT_CANCEL_REASON_CODES, isAppointmentCancelReasonCode } from './appointment-cancel-reason';

describe('appointment cancel reason codes', () => {
  it.each(APPOINTMENT_CANCEL_REASON_CODES)('should accept %s', (code) => {
    expect(isAppointmentCancelReasonCode(code)).toBe(true);
  });

  it.each(['', 'Не смогу прийти', 'illness', 42, undefined, null])('should reject %p', (value) => {
    expect(isAppointmentCancelReasonCode(value)).toBe(false);
  });
});
