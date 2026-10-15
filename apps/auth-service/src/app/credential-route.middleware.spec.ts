import type { NextFunction, Request, Response } from 'express';

import { LOGIN_ROUTE, REGISTER_ROUTE, pinCredentialRouteBucket } from './credential-route.middleware';

interface FakeRequest {
  originalUrl: string;
  body?: unknown;
}

function run(route: string, request: FakeRequest): jest.Mock {
  const next = jest.fn();
  pinCredentialRouteBucket(route)(request as unknown as Request, {} as Response, next as NextFunction);
  return next;
}

describe('pinCredentialRouteBucket', () => {
  it('should drop client_id from the body when a login form carries one', () => {
    const request: FakeRequest = { originalUrl: LOGIN_ROUTE, body: { email: 'a@b.by', client_id: 'rotate-1' } };

    run(LOGIN_ROUTE, request);

    expect(request.body).toEqual({ email: 'a@b.by' });
  });

  it('should rewrite the URL to the canonical path when the request used another case, a trailing slash or a query', () => {
    const request: FakeRequest = { originalUrl: '/OAuth/Login/?n=2', body: {} };

    run(LOGIN_ROUTE, request);

    expect(request.originalUrl).toBe(LOGIN_ROUTE);
  });

  it('should pin the registration route to its own canonical path when it is mounted for registration', () => {
    const request: FakeRequest = { originalUrl: '/API/v1/auth/register/', body: { client_id: 'x' } };

    run(REGISTER_ROUTE, request);

    expect(request.originalUrl).toBe(REGISTER_ROUTE);
    expect(request.body).toEqual({});
  });

  it.each([undefined, null, 'raw text', ['client_id']])(
    'should pass the request on untouched when the body is %j',
    (body) => {
      const request: FakeRequest = { originalUrl: LOGIN_ROUTE, body };

      const next = run(LOGIN_ROUTE, request);

      expect(request.body).toEqual(body);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );
});
