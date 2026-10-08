/**
 * ICD-10 code guard. Mirrors the frontend mask
 * `^[A-Z]\d{2}(\.\d{1,2})?$` from the frontend catalog mask (§4).
 *
 * The regex is only the *first* line of defence: the authoritative check
 * remains the server-side `$expand` against the seeded ICD-10 ValueSet
 * (BR-004). Free-text and lowercase input is rejected here.
 */
const ICD10_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

export function isValidIcd10Code(code: string): boolean {
  return ICD10_PATTERN.test(code);
}
