import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

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
    const incoming = request.header('x-request-id');
    const requestId =
      incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
