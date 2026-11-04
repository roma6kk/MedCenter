import { HttpStatus, type ArgumentsHost } from '@nestjs/common';

import { createFakeResponse, type FakeResponse } from '../__tests__/fake-response';
import { createLoginHarness } from '../__tests__/login-harness';
import { BROKEN_REQUEST_MESSAGE, UNAVAILABLE_MESSAGE, loginMessage } from '../login/login-messages';
import { OAuthError } from '../oauth-error';
import { AuthorizeErrorFilter } from './authorize-error.filter';

function hostOf(request: Record<string, unknown>, fake: FakeResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => fake.response }),
  } as unknown as ArgumentsHost;
}

/** What the JSON branches need of a response, on top of the login page's own calls. */
function withJsonSupport(fake: FakeResponse): { readonly type: jest.Mock; readonly setHeader: jest.Mock } {
  const response = fake.response as unknown as Record<string, jest.Mock>;
  const type = jest.fn().mockReturnValue(fake.response);
  const setHeader = jest.fn().mockReturnValue(fake.response);
  response['type'] = type;
  response['setHeader'] = setHeader;
  return { type, setHeader };
}

function createFilter(): AuthorizeErrorFilter {
  return new AuthorizeErrorFilter(createLoginHarness().page);
}

const BROWSER = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };

describe('AuthorizeErrorFilter', () => {
  it('should render the error page with the status of the refusal when a browser sends an unusable request', () => {
    const fake = createFakeResponse();

    createFilter().catch(OAuthError.invalidRequest('bad redirect_uri'), hostOf({ headers: BROWSER, query: {} }, fake));

    expect(fake.statusCode()).toBe(400);
    expect(fake.body()).toContain(BROKEN_REQUEST_MESSAGE);
    expect(fake.body()).not.toContain('<form');
  });

  it('should keep the RFC 6749 envelope when the client does not accept HTML', () => {
    const fake = createFakeResponse();
    const { type } = withJsonSupport(fake);

    createFilter().catch(OAuthError.invalidRequest('bad redirect_uri'), hostOf({ headers: { accept: '*/*' }, query: {} }, fake));

    expect(fake.statusCode()).toBe(400);
    expect(type).toHaveBeenCalledWith('application/json');
  });

  it('should render the unavailable page in the requested language when a browser meets a database failure', () => {
    const fake = createFakeResponse();

    createFilter().catch(new Error('connection refused'), hostOf({ headers: BROWSER, query: { ui_locales: 'en' } }, fake));

    expect(fake.statusCode()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(fake.body()).toContain(loginMessage('unavailable', 'en'));
    expect(fake.body()).not.toContain(UNAVAILABLE_MESSAGE);
  });

  it('should keep problem+json for an unexpected failure when the client does not accept HTML', () => {
    const fake = createFakeResponse();
    const { type } = withJsonSupport(fake);

    createFilter().catch(new Error('boom'), hostOf({ headers: {}, query: {}, originalUrl: '/oauth/authorize' }, fake));

    expect(fake.statusCode()).toBe(500);
    expect(type).toHaveBeenCalledWith('application/problem+json');
  });
});
