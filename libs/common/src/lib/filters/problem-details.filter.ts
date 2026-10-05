import {
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ERROR_CODES,
  ERROR_CODE_HTTP_STATUS,
  type ErrorCode,
  type FieldErrorDetail,
  type ProblemDetails,
} from '@medcenter/contracts';

interface ProblemDetailsRequest {
  readonly originalUrl: string;
  readonly requestId?: string;
}

function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Boundary filter (OWASP A05/A09): every error leaves a service as
 * `application/problem+json` with a catalogued `errorCode`. The 500 branch
 * never echoes `exception.message` — internal detail goes to the log keyed
 * by `requestId`; the client receives only the correlation id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  static fromValidationError(
    instance: string,
    requestId: string,
    details: FieldErrorDetail[],
  ): ProblemDetails {
    return {
      type: 'https://api.medcenter.by/errors/validation-error',
      title: 'Validation failed',
      status: ERROR_CODE_HTTP_STATUS.VALIDATION_ERROR,
      detail: details.map((detail) => `${detail.field}: ${detail.message}`).join('; '),
      instance,
      requestId,
      errorCode: 'VALIDATION_ERROR',
    };
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<ProblemDetailsRequest>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    if (exception instanceof HttpException) {
      const problem = this.fromHttpException(exception, request.originalUrl, requestId);
      response
        .status(problem.status)
        .type('application/problem+json')
        .send(problem);
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

  private fromHttpException(
    exception: HttpException,
    instance: string,
    requestId: string,
  ): ProblemDetails {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const errorCode = this.readExplicitErrorCode(payload) ?? this.toErrorCode(status);
    return {
      type: `https://api.medcenter.by/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
      title: exception.name,
      status,
      detail: this.readDetail(payload, exception),
      instance,
      requestId,
      errorCode,
    };
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
