import {
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Response } from 'express';
import { resolveRequestId } from '../request-id.middleware';
import {
  ERROR_CODES,
  ERROR_CODE_HTTP_STATUS,
  ERROR_CODE_TITLES,
  type ErrorCode,
  type FieldErrorDetail,
  type ProblemDetails,
} from '@medcenter/contracts';

interface ProblemDetailsRequest {
  readonly originalUrl: string;
  readonly requestId?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
}

/**
 * A failure of the body parser that runs before the request-id middleware
 * (`entity.too.large`, a broken gzip, malformed JSON): `body-parser` raises an
 * http-errors error with a 4xx `status` and `expose: true`. It is the caller's
 * mistake, not a fault of the service.
 */
function readClientParseError(exception: unknown): { readonly tooLarge: boolean } | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const { status, statusCode, expose, type } = exception as Record<string, unknown>;
  const code = typeof status === 'number' ? status : statusCode;
  if (typeof code !== 'number' || code < 400 || code > 499 || expose !== true) {
    return null;
  }
  return { tooLarge: type === 'entity.too.large' || code === 413 };
}

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The only errors whose `details[]` reaches the client (API §1): a failed DTO
 * validation, and the two `422` terminology refusals of `POST /encounters/{id}/complete`,
 * which name the offending request field (`diagnoses.0.code`) next to `detail`.
 */
const FIELD_DETAIL_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['VALIDATION_ERROR', 'INVALID_ICD10_CODE', 'TERMINOLOGY_NOT_FOUND']);

/**
 * Boundary filter (OWASP A05/A09): every error leaves a service as
 * `application/problem+json` with a catalogued `errorCode`. The 500 branch
 * never echoes `exception.message` — internal detail goes to the log keyed
 * by `requestId`; the client receives only the correlation id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<ProblemDetailsRequest>();
    const response = context.getResponse<Response>();
    // The body parser fails before `RequestIdMiddleware`; keep the caller's id or mint one so the log and the body still correlate.
    const requestId = request.requestId ?? this.adoptRequestId(request, response);

    if (exception instanceof HttpException) {
      const problem = this.fromHttpException(exception, request.originalUrl, requestId);
      if (problem.status === HttpStatus.UNAUTHORIZED) {
        response.header('WWW-Authenticate', this.toChallenge(problem.errorCode, request));
      }
      response
        .status(problem.status)
        .type('application/problem+json')
        .send(problem);
      return;
    }

    const parseError = readClientParseError(exception);
    if (parseError !== null) {
      this.logger.debug({ err: exception, requestId }, 'Request body rejected');
      const problem = this.fromHttpException(
        new HttpException(
          {
            errorCode: 'VALIDATION_ERROR',
            message: parseError.tooLarge
              ? 'Request body is too large'
              : 'Request body could not be read',
          },
          HttpStatus.BAD_REQUEST,
        ),
        request.originalUrl,
        requestId,
      );
      response.status(problem.status).type('application/problem+json').send(problem);
      return;
    }

    this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    const problem: ProblemDetails = {
      type: 'https://api.medcenter.by/errors/internal',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Внутренняя ошибка сервера',
      instance: request.originalUrl,
      requestId,
      errorCode: 'INTERNAL',
    };
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .type('application/problem+json')
      .send(problem);
  }

  private adoptRequestId(request: ProblemDetailsRequest, response: Response): string {
    const header = request.headers?.['x-request-id'];
    const requestId = resolveRequestId(typeof header === 'string' ? header : undefined);
    response.setHeader('x-request-id', requestId);
    return requestId;
  }

  /** RFC 6750 §3: a 401 names the scheme; a presented token that failed is an `invalid_token`. */
  private toChallenge(errorCode: ErrorCode, request: ProblemDetailsRequest): string {
    const presented = request.headers?.['authorization'] !== undefined;
    return errorCode === 'TOKEN_REVOKED' || (errorCode === 'UNAUTHENTICATED' && presented)
      ? 'Bearer error="invalid_token"'
      : 'Bearer';
  }

  private fromHttpException(
    exception: HttpException,
    instance: string,
    requestId: string,
  ): ProblemDetails {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const errorCode = this.readExplicitErrorCode(payload) ?? this.toErrorCode(status);
    // `details[]` is the contract of FIELD_DETAIL_CODES only (API §1); another error never carries field data.
    const details = FIELD_DETAIL_CODES.has(errorCode) ? this.readFieldDetails(payload) : [];
    return {
      type: `https://api.medcenter.by/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
      title: ERROR_CODE_TITLES[errorCode],
      status,
      detail: this.readDetail(payload, exception),
      instance,
      requestId,
      errorCode,
      ...(details.length > 0 ? { details } : {}),
    };
  }

  /** `details[]` of a validation failure; anything that is not a `{ field, message }` pair is dropped. */
  private readFieldDetails(payload: unknown): FieldErrorDetail[] {
    if (typeof payload !== 'object' || payload === null || !('details' in payload)) {
      return [];
    }
    const { details } = payload as { details?: unknown };
    if (!Array.isArray(details)) {
      return [];
    }
    return details.flatMap((entry: unknown): FieldErrorDetail[] => {
      const { field, message } = (entry ?? {}) as { field?: unknown; message?: unknown };
      return typeof field === 'string' && typeof message === 'string' ? [{ field, message }] : [];
    });
  }

  private readExplicitErrorCode(payload: unknown): ErrorCode | null {
    if (typeof payload !== 'object' || payload === null || !('errorCode' in payload)) {
      return null;
    }
    const { errorCode } = payload as { errorCode?: unknown };
    if (typeof errorCode !== 'string' || !isErrorCode(errorCode)) {
      return null;
    }
    return errorCode;
  }

  private readDetail(payload: unknown, exception: HttpException): string {
    if (typeof payload === 'string' && payload.length > 0) {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const { message } = payload as { message?: unknown };
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return exception.message;
  }

  private toErrorCode(status: number): ErrorCode {
    const found = Object.entries(ERROR_CODE_HTTP_STATUS).find(([, value]) => value === status);
    return found?.[0] as ErrorCode | undefined ?? 'INTERNAL';
  }
}
