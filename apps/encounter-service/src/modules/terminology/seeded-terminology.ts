import { FHIR_BY } from '@medcenter/terminology';

/**
 * Code system of the seeded ICD-10 ValueSet (`tools/terminology-seed`,
 * `TERMINOLOGY_URLS.ICD10_CODE_SYSTEM`); `libs/terminology` declares only the
 * ValueSet so far, so the canonical is kept here.
 */
export const ICD10_CODE_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

/**
 * Code system → seeded `fhir.by` ValueSet, mirroring `TERMINOLOGY_URLS` of
 * `tools/terminology-seed/terminology-resources.ts` (ADR-002/016). A code is
 * "known" only when the ValueSet that the seed publishes for its system
 * contains it; a system missing here is not part of the seed at all.
 */
export const SEEDED_VALUE_SETS: Readonly<Record<string, string>> = {
  [ICD10_CODE_SYSTEM]: FHIR_BY.ICD10_VALUE_SET,
  [FHIR_BY.ATC_CODE_SYSTEM]: 'https://fhir.by/ValueSet/atc',
  [FHIR_BY.UCUM_SYSTEM]: 'https://fhir.by/ValueSet/ucum-units',
  [FHIR_BY.SERVICE_CODE_SYSTEM]: 'https://fhir.by/ValueSet/nsi-services',
  [FHIR_BY.OBSERVATION_CODE_SYSTEM]: 'https://fhir.by/ValueSet/nsi-observations',
};

/** Seeded ValueSet of a code system, or `undefined` when the system is outside the seed. */
export function seededValueSetOf(system: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(SEEDED_VALUE_SETS, system) ? SEEDED_VALUE_SETS[system] : undefined;
}
