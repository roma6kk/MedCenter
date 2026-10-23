import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { errorCodesFor, PROBLEM_DETAILS_SCHEMA, PROBLEM_JSON } from './problem-details.schema';

/**
 * One `@ApiResponse` per error status, in `application/problem+json` and pointing at the global
 * `problemDetails` schema. The description names the catalogue `errorCode`s of API §1 that
 * the status can carry, so the Swagger UI doubles as the error catalogue.
 *
 * `extra` adds endpoint-specific wording per status, e.g. `{ 409: 'slot already busy' }`.
 */
export function ApiProblems(
  statuses: readonly number[],
  extra: Readonly<Record<number, string>> = {},
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) => {
      const codes = errorCodesFor(status);
      const catalogue = codes.length > 0 ? ` (errorCode: ${codes.join(' | ')})` : '';
      return ApiResponse({
        status,
        description: `${extra[status] ?? 'Problem Details (RFC 7807)'}${catalogue}`,
        content: { [PROBLEM_JSON]: { schema: { $ref: `#/components/schemas/${PROBLEM_DETAILS_SCHEMA}` } } },
      });
    }),
  );
}

/** Statuses every guarded endpoint can answer through the guard stack (API §0): 401, 403, 429, 500. */
export const GUARD_PROBLEM_STATUSES: readonly number[] = [401, 403, 429, 500];
