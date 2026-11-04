/**
 * `@ValidateIf` condition of a field of a PATCH body that may be left out but not emptied: `@IsOptional` would
 * skip the validators for `null` as well, and `null` would reach the service as if it were a value.
 */
export function isPresent(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}
