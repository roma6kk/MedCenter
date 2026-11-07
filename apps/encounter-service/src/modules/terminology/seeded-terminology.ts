import { FHIR_BY } from '@medcenter/terminology';

export const ICD10_CODE_SYSTEM = 'https://fhir.by/CodeSystem/InternClassificDiseases10';

export const SEEDED_VALUE_SETS: Readonly<Record<string, string>> = {
  [ICD10_CODE_SYSTEM]: FHIR_BY.ICD10_VALUE_SET,
  [FHIR_BY.ATC_CODE_SYSTEM]: 'https://fhir.by/ValueSet/atc',
  [FHIR_BY.UCUM_SYSTEM]: 'https://fhir.by/ValueSet/ucum-units',
  [FHIR_BY.SERVICE_CODE_SYSTEM]: 'https://fhir.by/ValueSet/nsi-services',
  [FHIR_BY.OBSERVATION_CODE_SYSTEM]: 'https://fhir.by/ValueSet/nsi-observations',
};

export function seededValueSetOf(system: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(SEEDED_VALUE_SETS, system) ? SEEDED_VALUE_SETS[system] : undefined;
}
