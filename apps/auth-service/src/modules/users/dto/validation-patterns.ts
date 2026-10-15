/** R4 `date` without time — `Patient.birthDate` rejects a full timestamp. */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * R4 `id` (`[A-Za-z0-9\-.]{1,64}`): HAPI assigns numeric ids, seeds use slugs, so not `@IsUUID()`.
 * An id of dots only is refused although R4 allows it: in a URL path `PractitionerRole/..`
 * collapses to the server base and `PractitionerRole/.` to a search, so such an id would
 * "exist" in HAPI and end up as a bogus `fhirUser` claim.
 */
export const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

export const EMAIL_MAX_LENGTH = 255;
export const NAME_MAX_LENGTH = 100;

/** Upper bound for a password; scrypt cost does not depend on it, the request size does. */
export const PASSWORD_MAX_LENGTH = 128;

export const GENDERS = ['male', 'female'] as const;

/**
 * `@ValidateIf` predicate of an optional field that may be absent but never `null`.
 * `@IsOptional()` also skips JSON `null`, which then reached the service as if it were a
 * value: a 500 for `email`/`roles`, a `null` in a NOT NULL column for `isActive`/the names.
 */
export function isPresent(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}
