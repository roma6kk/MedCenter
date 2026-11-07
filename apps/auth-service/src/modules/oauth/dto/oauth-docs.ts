import { ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { OAuthErrorDoc } from './oauth-response.doc';

const PROBLEM_REF = { $ref: '#/components/schemas/problemDetails' };

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

export function ApiOAuthInvalidClient(description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({
    status: 401,
    description,
    content: { 'application/json': { schema: { $ref: getSchemaPath(OAuthErrorDoc) } } },
  });
}
