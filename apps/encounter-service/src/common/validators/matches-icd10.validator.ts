import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidIcd10Code } from '@medcenter/terminology';

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
