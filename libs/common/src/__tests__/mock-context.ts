import type { ExecutionContext, HttpException, Type } from '@nestjs/common';

export interface MockHttpResponse {
  readonly header: jest.Mock;
  readonly status: jest.Mock;
  readonly type: jest.Mock;
  readonly send: jest.Mock;
}

export interface MockHttpContext {
  readonly context: ExecutionContext;
  readonly request: Record<string, unknown>;
  readonly response: MockHttpResponse;
}

export interface MockHttpContextOptions {
  readonly handler: (...args: unknown[]) => unknown;
  readonly controller: Type<unknown>;
  readonly request?: Record<string, unknown>;
}

export function createMockHttpContext(options: MockHttpContextOptions): MockHttpContext {
  const request = options.request ?? {};
  const response: MockHttpResponse = {
    header: jest.fn(),
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
    getHandler: () => options.handler,
    getClass: () => options.controller,
  } as unknown as ExecutionContext;
  return { context, request, response };
}

export function captureHttpException(action: () => unknown): HttpException {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof Error === false) {
      throw error;
    }
    if ('getStatus' in error === false) {
      throw error;
    }
    return error as HttpException;
  }
  throw new Error('Expected an HttpException to be thrown, but the call succeeded');
}

export async function captureAsyncHttpException(action: () => Promise<unknown>): Promise<HttpException> {
  try {
    await action();
  } catch (error: unknown) {
    if (error instanceof Error === false) {
      throw error;
    }
    if ('getStatus' in error === false) {
      throw error;
    }
    return error as HttpException;
  }
  throw new Error('Expected an HttpException to be rejected, but the call succeeded');
}
