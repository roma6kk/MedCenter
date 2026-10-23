import { applyDecorators } from '@nestjs/common';
import { ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { OAuthErrorDoc } from './oauth-response.doc';

const PROBLEM_REF = { $ref: '#/components/schemas/problemDetails' };

/**
 * `400` of the OAuth surface: the RFC 6749 §5.2 envelope for every protocol failure, and RFC 7807
 * `application/problem+json` when the global `ValidationPipe` rejects the shape of the input first.
 */
export function ApiOAuthBadRequest(description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status: 400,
    description,
    content: {
      'application/json': { schema: { $ref: getSchemaPath(OAuthErrorDoc) } },
      'application/problem+json': { schema: PROBLEM_REF },
    },
  });
}

/** `401 invalid_client` in the RFC 6749 §5.2 envelope (the OAuth surface does not use RFC 7807 here). */
export function ApiOAuthInvalidClient(description: string): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description,
      content: { 'application/json': { schema: { $ref: getSchemaPath(OAuthErrorDoc) } } },
    }),
  );
}
