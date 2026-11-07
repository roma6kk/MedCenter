import { registerDecorator, type ValidationOptions } from 'class-validator';

export function UniqueBy(key: string, options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'uniqueBy',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `$property must not repeat the same ${key}`, ...options },
      validator: {
        validate: (value: unknown): boolean => {
          if (!Array.isArray(value)) {
            return true;
          }
          const seen = new Set<string>();
          for (const item of value as unknown[]) {
            const field = typeof item === 'object' && item !== null ? (item as Record<string, unknown>)[key] : undefined;
            if (typeof field !== 'string') {
              continue;
            }
            const normal = field.trim().toUpperCase();
            if (seen.has(normal)) {
              return false;
            }
            seen.add(normal);
          }
          return true;
        },
      },
    });
  };
}
