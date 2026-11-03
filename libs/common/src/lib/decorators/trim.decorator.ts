import { Transform } from 'class-transformer';

/**
 * Trims a string property before it is validated (the global `ValidationPipe` transforms first), so padding
 * cannot satisfy a length bound and blank text never becomes a stored value. Anything that is not a string
 * passes through for the `@IsString()` check to refuse.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
}
