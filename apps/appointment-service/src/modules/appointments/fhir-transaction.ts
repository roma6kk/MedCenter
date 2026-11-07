import { parseReference } from './fhir-reference';

/**
 * Logical id of a FHIR reference (`Slot/abc`, `Slot/abc/_history/2` and
 * `http://hapi/fhir/Slot/abc` -> `abc`); `''` when it is not a reference, so
 * callers never turn junk into a `GET Slot/` collection request.
 */
export function referenceId(reference: unknown): string {
  return parseReference(reference)?.id ?? '';
}

/** Resource id from a transaction `response.location` (`Appointment/abc/_history/1`, relative or absolute -> `abc`). */
export function idFromLocation(location: string | undefined): string {
  return referenceId(location);
}
