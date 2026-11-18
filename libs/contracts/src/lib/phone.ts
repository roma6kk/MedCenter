export const BELARUS_PHONE_PATTERN = /^\+375\d{9}$/;

const PHONE_SEPARATORS = /[\s\-()]/g;

export function normaliseBelarusPhone(input: string): string | null {
  const compact = input.replace(PHONE_SEPARATORS, '');
  return BELARUS_PHONE_PATTERN.test(compact) ? compact : null;
}

export interface UpdateMyPatientRequest {
  readonly phone: string;
}
