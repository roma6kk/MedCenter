/** Neutral cancellation reasons: codes only, never free text, and none that names a state of health. */
export const APPOINTMENT_CANCEL_REASON_CODES = ['plans-changed', 'inconvenient-time', 'other-doctor', 'other'] as const;

export type AppointmentCancelReasonCode = (typeof APPOINTMENT_CANCEL_REASON_CODES)[number];

export const APPOINTMENT_CANCEL_REASON_SYSTEM = 'urn:medcenter:appointment-cancel-reason';

export function isAppointmentCancelReasonCode(value: unknown): value is AppointmentCancelReasonCode {
  return typeof value === 'string' && (APPOINTMENT_CANCEL_REASON_CODES as ReadonlyArray<string>).includes(value);
}
