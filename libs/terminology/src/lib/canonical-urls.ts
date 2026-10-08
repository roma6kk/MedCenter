/**
 * Single source of truth for `fhir.by` canonical URLs (ADR-002).
 *
 * All terminology validators live here so a ValueSet/CodeSystem change needs
 * to be made in exactly one place. These URLs are not meant to be used for
 * live `$expand` from the outside world; the authoritative check is the
 * server-side `$expand` against the seeded ValueSet (BR-004).
 */
export const FHIR_BY = {
  ICD10_VALUE_SET: 'https://fhir.by/ValueSet/InternClassificDiseases10',
  SERVICE_CODE_SYSTEM: 'https://fhir.by/CodeSystem/nsi-services',
  OBSERVATION_CODE_SYSTEM: 'https://fhir.by/CodeSystem/nsi-observations',
  ATC_CODE_SYSTEM: 'http://www.whocc.no/atc',
  UCUM_SYSTEM: 'http://unitsofmeasure.org',
} as const;
