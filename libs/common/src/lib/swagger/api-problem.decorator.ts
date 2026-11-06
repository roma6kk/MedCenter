import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

import { errorCodesFor, PROBLEM_DETAILS_SCHEMA, PROBLEM_JSON } from './problem-details.schema';

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

export const GUARD_PROBLEM_STATUSES: readonly number[] = [401, 403, 429, 500];
