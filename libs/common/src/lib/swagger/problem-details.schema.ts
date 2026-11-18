import { ERROR_CODES, ERROR_CODE_HTTP_STATUS, type ErrorCode } from '@medcenter/contracts';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const PROBLEM_DETAILS_SCHEMA = 'problemDetails';

export const PROBLEM_JSON = 'application/problem+json';

export function errorCodesFor(status: number): ErrorCode[] {
  return ERROR_CODES.filter((code) => ERROR_CODE_HTTP_STATUS[code] === status);
}

export function problemDetailsSchema(): SchemaObject {
  return {
    type: 'object',
    required: ['type', 'title', 'status', 'detail', 'instance', 'requestId', 'errorCode'],
    properties: {
      type: { type: 'string', format: 'uri', example: 'https://api.medcenter.by/errors/slot-conflict' },
      title: { type: 'string', example: 'Slot conflict' },
      status: { type: 'integer', example: 409 },
      detail: { type: 'string', example: 'Slot 7c9e is already busy' },
      instance: { type: 'string', example: '/api/v1/appointments' },
      requestId: { type: 'string', example: '01J9ZK3M8Q' },
      errorCode: { type: 'string', enum: [...ERROR_CODES], description: 'Error catalogue of API spec section 1' },
      details: {
        type: 'array',
        description: 'One entry per violated constraint (VALIDATION_ERROR, INVALID_ICD10_CODE, TERMINOLOGY_NOT_FOUND)',
        items: {
          type: 'object',
          required: ['field', 'message'],
          properties: {
            field: { type: 'string', example: 'diagnoses.0.code' },
            message: { type: 'string' },
          },
        },
      },
    },
  };
}
