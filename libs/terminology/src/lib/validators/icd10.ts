/** First line of defence only: the authoritative check is the server-side `$expand` of the seeded ValueSet. */
const ICD10_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

export function isValidIcd10Code(code: string): boolean {
  return ICD10_PATTERN.test(code);
}
