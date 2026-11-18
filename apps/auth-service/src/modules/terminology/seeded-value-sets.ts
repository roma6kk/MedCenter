import { FHIR_BY, isValidAtcCode, isValidIcd10Code } from '@medcenter/terminology';

export const FHIR_BY_VALUE_SET_PREFIX = 'https://fhir.by/ValueSet/';

/**
 * A ValueSet canonical this API will hand to HAPI. Restricting the grammar keeps
 * the terminology server from being pointed at an arbitrary URL (HAPI would try
 * to resolve it) and bounds the cache key space.
 */
export const VALUE_SET_URL_PATTERN = /^https:\/\/fhir\.by\/ValueSet\/[A-Za-z0-9._-]{1,100}$/;

export const ICD10_CODE_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

export const SEEDED_URLS = {
  ICD10_CODE_SYSTEM,
  ICD10_VALUE_SET: FHIR_BY.ICD10_VALUE_SET,
  ATC_CODE_SYSTEM: FHIR_BY.ATC_CODE_SYSTEM,
  ATC_VALUE_SET: `${FHIR_BY_VALUE_SET_PREFIX}atc`,
  UCUM_SYSTEM: FHIR_BY.UCUM_SYSTEM,
  UCUM_VALUE_SET: `${FHIR_BY_VALUE_SET_PREFIX}ucum-units`,
  SERVICE_CODE_SYSTEM: FHIR_BY.SERVICE_CODE_SYSTEM,
  SERVICE_VALUE_SET: `${FHIR_BY_VALUE_SET_PREFIX}nsi-services`,
  OBSERVATION_CODE_SYSTEM: FHIR_BY.OBSERVATION_CODE_SYSTEM,
  OBSERVATION_VALUE_SET: `${FHIR_BY_VALUE_SET_PREFIX}nsi-observations`,
} as const;

const SEEDED_VALUE_SETS: Readonly<Record<string, string>> = {
  [SEEDED_URLS.ICD10_CODE_SYSTEM]: SEEDED_URLS.ICD10_VALUE_SET,
  [SEEDED_URLS.ATC_CODE_SYSTEM]: SEEDED_URLS.ATC_VALUE_SET,
  [SEEDED_URLS.UCUM_SYSTEM]: SEEDED_URLS.UCUM_VALUE_SET,
  [SEEDED_URLS.SERVICE_CODE_SYSTEM]: SEEDED_URLS.SERVICE_VALUE_SET,
  [SEEDED_URLS.OBSERVATION_CODE_SYSTEM]: SEEDED_URLS.OBSERVATION_VALUE_SET,
};

export function seededValueSetOf(system: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(SEEDED_VALUE_SETS, system) ? SEEDED_VALUE_SETS[system] : undefined;
}

const CODE_SHAPE_GUARDS: Readonly<Record<string, (code: string) => boolean>> = {
  [SEEDED_URLS.ICD10_CODE_SYSTEM]: isValidIcd10Code,
  [SEEDED_URLS.ATC_CODE_SYSTEM]: isValidAtcCode,
};

export function hasValidCodeShape(system: string, code: string): boolean {
  const guard = Object.prototype.hasOwnProperty.call(CODE_SHAPE_GUARDS, system) ? CODE_SHAPE_GUARDS[system] : undefined;
  return guard === undefined || guard(code);
}
