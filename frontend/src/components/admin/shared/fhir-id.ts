/** R4 `id`; an id of dots only is refused (it would collapse in a URL path), like the server does. */
export const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;
