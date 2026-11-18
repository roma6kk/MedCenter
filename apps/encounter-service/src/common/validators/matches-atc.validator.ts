import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidAtcCode } from '@medcenter/terminology';

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
