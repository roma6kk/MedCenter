// `@IsOptional` would skip validators for `null` too, and `null` would reach the service as a value.
export function isPresent(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}
