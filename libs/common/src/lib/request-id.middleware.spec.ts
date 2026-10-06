import type { NextFunction, Response } from 'express';
import { RequestIdMiddleware, type RequestWithRequestId } from './request-id.middleware';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeRequest(incoming?: string): RequestWithRequestId {
  return {
    header: (name: string): string | undefined =>
      name.toLowerCase() === 'x-request-id' ? incoming : undefined,
  } as unknown as RequestWithRequestId;
}

function makeResponse(): { readonly setHeader: jest.Mock } {
  return { setHeader: jest.fn() };
}

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('should reuse a well-formed incoming x-request-id header', () => {
    const request = makeRequest('req-123_ABC.def');
    const response = makeResponse();
    const next = jest.fn();

    middleware.use(request, response as unknown as Response, next as unknown as NextFunction);

    expect(request.requestId).toBe('req-123_ABC.def');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'req-123_ABC.def');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should generate a UUID when the header is absent', () => {
    const request = makeRequest();
    const response = makeResponse();

    middleware.use(request, response as unknown as Response, jest.fn());

    expect(request.requestId).toMatch(UUID_V4);
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', request.requestId);
  });

  it.each([
    ['contains a space', 'bad id'],
    ['exceeds the 128 character cap', 'a'.repeat(129)],
    ['carries a header-splitting newline', 'id\nx-evil: 1'],
    ['contains a path separator', 'id/1'],
  ])('should generate a UUID when the header %s', (_label, badHeader) => {
    const request = makeRequest(badHeader);
    const response = makeResponse();

    middleware.use(request, response as unknown as Response, jest.fn());

    expect(request.requestId).toMatch(UUID_V4);
    expect(request.requestId).not.toBe(badHeader);
  });

  it('should echo exactly the id it assigned on the response', () => {
    const request = makeRequest();
    const response = makeResponse();

    middleware.use(request, response as unknown as Response, jest.fn());

    expect(response.setHeader).toHaveBeenCalledTimes(1);
    const [headerName, headerValue] = response.setHeader.mock.calls[0] as [string, string];
    expect(headerName).toBe('x-request-id');
    expect(headerValue).toBe(request.requestId);
  });

  it('should call next exactly once for every request', () => {
    const next = jest.fn();

    middleware.use(makeRequest('abc'), makeResponse() as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
