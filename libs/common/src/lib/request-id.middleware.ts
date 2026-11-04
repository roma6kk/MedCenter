import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** A valid incoming `x-request-id` is kept, anything else is replaced by a fresh uuid. */
export function resolveRequestId(incoming: string | undefined): string {
  return incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export interface RequestWithRequestId extends Request {
  requestId?: string;
}

/**
 * Assigns a correlation id to every request (NFR-007): taken from a valid
 * `x-request-id` header or generated, then echoed back on the response and
 * read by `ProblemDetailsFilter` / the pino logger.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithRequestId, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header('x-request-id'));
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
