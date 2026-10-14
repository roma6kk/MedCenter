import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidAtcCode } from '@medcenter/terminology';

/**
 * First line of defence for an ATC code (API §7.3 `@MatchesATC()`, BR-009): the
 * `libs/terminology` grammar (level 4/5, e.g. `J01FA10`). Presence in the seeded
 * ATC CodeSystem is checked by `TerminologyValidatorService` (422 `TERMINOLOGY_NOT_FOUND`).
 */
export function MatchesATC(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'matchesAtc',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: '$property must be an ATC code such as J01FA10', ...options },
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' && isValidAtcCode(value),
      },
    });
  };
}
