import { BadRequestException, HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';

import { InMemoryClientRegistry } from '../guards/client.guard';
import { createFakeResponse, type FakeResponse } from '../__tests__/fake-response';
import { createLoginHarness } from '../__tests__/login-harness';
import { TEST_REDIRECT_URI, createTestClient } from '../__tests__/test-keys';
import { THROTTLED_MESSAGE, UNAVAILABLE_MESSAGE, loginMessage } from './login-messages';
import { LoginRateLimitFilter } from './login-rate-limit.filter';

const AUTHORIZE_QUERY = new URLSearchParams({
  response_type: 'code',
  client_id: 'medcenter-web',
  redirect_uri: TEST_REDIRECT_URI,
  state: 'st',
}).toString();

function hostOf(request: Record<string, unknown>, fake: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => fake.response }),
  } as unknown as ArgumentsHost;
}

function createFilter(): LoginRateLimitFilter {
  const { page } = createLoginHarness();
  return new LoginRateLimitFilter(page, new InMemoryClientRegistry([createTestClient()]));
}

function rateLimited(): HttpException {
  return new HttpException({ errorCode: 'RATE_LIMITED', message: 'Rate limit exceeded' }, HttpStatus.TOO_MANY_REQUESTS);
}

function withProblemSupport(fake: FakeResponse): { readonly type: jest.Mock } {
  const response = fake.response as unknown as { status: jest.Mock; type?: jest.Mock; setHeader?: jest.Mock };
  const type = jest.fn().mockReturnValue(fake.response);
  response.type = type;
  response.setHeader = response.setHeader ?? jest.fn();
  return { type };
}

describe('LoginRateLimitFilter', () => {
  it('should render the login page with the throttle message when the IP limit answers 429', async () => {
    const fake = createFakeResponse();
    const request = { headers: {}, body: { authorize_query: AUTHORIZE_QUERY, email: 'ivanov@example.by' } };

    await createFilter().catch(rateLimited(), hostOf(request, fake));

    expect(fake.statusCode()).toBe(429);
    expect(fake.body()).toContain(THROTTLED_MESSAGE);
    expect(fake.body()).toContain('<form');
    expect(fake.body()).toContain('value="ivanov@example.by"');
  });

  it('should render a form that can be submitted again when the browser comes back later', async () => {
    const fake = createFakeResponse();

    await createFilter().catch(rateLimited(), hostOf({ headers: {}, body: { authorize_query: AUTHORIZE_QUERY } }, fake));

    expect(fake.cookies.map((cookie) => cookie.name)).toContain('mc_as_csrf');
  });

  it('should render the dead-end page without a form when the authorization request is unusable', async () => {
    const fake = createFakeResponse();

    await createFilter().catch(rateLimited(), hostOf({ headers: {}, body: { authorize_query: 'client_id=unknown' } }, fake));

    expect(fake.statusCode()).toBe(429);
    expect(fake.body()).toContain(THROTTLED_MESSAGE);
    expect(fake.body()).not.toContain('<form');
  });

  it('should render the dead-end page when the request carries no body at all', async () => {
    const fake = createFakeResponse();

    await createFilter().catch(rateLimited(), hostOf({ headers: {} }, fake));

    expect(fake.statusCode()).toBe(429);
    expect(fake.body()).not.toContain('<form');
  });

  it('should hand any other HttpException to the problem-details filter when it is not a 429', async () => {
    const fake = createFakeResponse();
    const { type } = withProblemSupport(fake);

    await createFilter().catch(new BadRequestException('bad form'), hostOf({ headers: {}, originalUrl: '/oauth/login' }, fake));

    expect(fake.statusCode()).toBe(400);
    expect(type).toHaveBeenCalledWith('application/problem+json');
  });

  it('should render the login page with the unavailable message when the database fails for a browser', async () => {
    const fake = createFakeResponse();
    const request = { headers: { accept: 'text/html,application/xhtml+xml' }, body: { authorize_query: AUTHORIZE_QUERY, email: 'ivanov@example.by' } };

    await createFilter().catch(new Error('connection refused'), hostOf(request, fake));

    expect(fake.statusCode()).toBe(503);
    expect(fake.body()).toContain(UNAVAILABLE_MESSAGE);
    expect(fake.body()).toContain('value="ivanov@example.by"');
  });

  it('should answer in English when the authorize query asks for it', async () => {
    const fake = createFakeResponse();
    const request = { headers: { accept: 'text/html' }, body: { authorize_query: `${AUTHORIZE_QUERY}&ui_locales=en` } };

    await createFilter().catch(rateLimited(), hostOf(request, fake));

    expect(fake.body()).toContain(loginMessage('throttled', 'en'));
    expect(fake.body()).toContain('<html lang="en">');
  });

  it('should keep problem+json for an unexpected failure when the client does not accept HTML', async () => {
    const fake = createFakeResponse();
    const { type } = withProblemSupport(fake);

    await createFilter().catch(new Error('boom'), hostOf({ headers: { accept: 'application/json' }, originalUrl: '/oauth/login' }, fake));

    expect(fake.statusCode()).toBe(500);
    expect(type).toHaveBeenCalledWith('application/problem+json');
  });
});
