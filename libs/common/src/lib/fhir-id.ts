/**
 * FHIR R4 `id` grammar (`[A-Za-z0-9\-.]{1,64}`) minus ids made only of dots: `.`/`..` are legal by the regex, but as a
 * URL path segment they collapse `Type/..` into the FHIR base URL or `Type/.` into a search, so they never name a
 * resource. A comma is excluded by the grammar itself: it would turn a reference search into an OR.
 */
export const FHIR_ID_SOURCE = '(?!\\.+$)[A-Za-z0-9\\-.]{1,64}';

/** Whole-string match of one FHIR id (path parameters, body fields). */
export const FHIR_ID_PATTERN = new RegExp(`^${FHIR_ID_SOURCE}$`);
