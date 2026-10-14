/**
 * FHIR R4 `id` grammar (`[A-Za-z0-9\-.]{1,64}`) minus ids made only of dots:
 * `.`/`..` are legal by the regex, but `Location/..` collapses to the FHIR base
 * URL inside `fetch`, so they never reach HAPI. A comma is excluded by the
 * grammar itself — it would turn a reference search into an OR over other resources.
 */
export const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;
