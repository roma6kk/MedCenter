import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidIcd10Code } from '@medcenter/terminology';

/**
 * First line of defence for an ICD-10 code (API §7.3 `@MatchesICD10()`): the
 * `libs/terminology` grammar. Membership in the seeded ValueSet
 * `https://fhir.by/ValueSet/InternClassificDiseases10` is checked by
 * `TerminologyValidatorService` (422 `INVALID_ICD10_CODE`).
 */
export function MatchesICD10(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'matchesIcd10',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: '$property must be an ICD-10 code such as J06.9', ...options },
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isValidIcd10Code(value),
      },
    });
  };
}
