import { BadRequestException, type Type } from '@nestjs/common';
import { createValidationPipe } from '@medcenter/common';

type Source = 'body' | 'query' | 'param';

/**
 * Runs `value` through the very pipe `main.ts` mounts globally (`whitelist`,
 * `transform`) and returns what it did to the DTO. Rejections surface as the
 * `BadRequestException` the filter turns into `400 VALIDATION_ERROR`.
 */
export function pipeline(
  metatype: Type<unknown>,
  value: unknown,
  type: Source = 'body',
): Promise<unknown> {
  return Promise.resolve(createValidationPipe().transform(value, { type, metatype }));
}

/** The constraint messages the pipe reports for `value`; an empty list means the value was accepted. */
export async function violationsOf(
  metatype: Type<unknown>,
  value: unknown,
  type: Source = 'body',
): Promise<ReadonlyArray<string>> {
  try {
    await pipeline(metatype, value, type);
    return [];
  } catch (error: unknown) {
    if (!(error instanceof BadRequestException)) {
      throw error;
    }
    const { message } = error.getResponse() as { readonly message?: unknown };
    return Array.isArray(message) ? message.map(String) : [String(message)];
  }
}
