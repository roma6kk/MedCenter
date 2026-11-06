const FHIR_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatHorizonDate(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = FHIR_DATE_PREFIX.exec(value);
  return match === null ? undefined : `${match[3]}.${match[2]}.${match[1]}`;
}
