/**
 * Belarus phone number (API §3.12): stored and returned as `+375XXXXXXXXX`.
 * Spaces, dashes and parentheses are accepted on input and dropped.
 */
export const BELARUS_PHONE_PATTERN = /^\+375\d{9}$/;

const PHONE_SEPARATORS = /[\s\-()]/g;

/** The normalised number, or `null` when `input` is not a Belarus number. */
export function normaliseBelarusPhone(input: string): string | null {
  const compact = input.replace(PHONE_SEPARATORS, '');
  return BELARUS_PHONE_PATTERN.test(compact) ? compact : null;
}

/** API §3.12 `PATCH /api/v1/me/patient` body: the only contact a patient edits themselves. */
export interface UpdateMyPatientRequest {
  readonly phone: string;
}
