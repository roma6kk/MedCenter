import { parseReference } from './fhir-reference';

export function referenceId(reference: unknown): string {
  return parseReference(reference)?.id ?? '';
}

export function idFromLocation(location: string | undefined): string {
  return referenceId(location);
}
