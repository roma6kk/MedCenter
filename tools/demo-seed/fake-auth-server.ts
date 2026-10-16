import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import { authorizeLocation, sanitizeAuthorizeQuery } from '../../apps/auth-service/src/modules/oauth/login/authorize-query';
import { renderLoginPage } from '../../apps/auth-service/src/modules/oauth/login/login-page';
import type { FetchLike } from '../shared/fhir-http';

/**
 * Test double of auth-service's authorization endpoints for the users-step
 * tests. It answers in the shapes of `apps/auth-service/src/modules/oauth`
 * (cookies, CSRF double submit, single-use login session, redirect targets) and
 * renders the REAL login page (`renderLoginPage`), so a change to the markup or
 * the form fields breaks the seed's tests instead of its first live run.
 */

export interface FakeAuthOptions {
  readonly clientId: string;
  readonly redirectUri: string;
  /** email -> password of the accounts that may log in. */
  readonly accounts: Readonly<Record<string, string>>;
  /** Answer every login POST with this status instead of processing it (e.g. 429). */
  readonly loginStatus?: number;
  /** Scope the token response reports (a real server reports what it granted); omitted when unset. */
  readonly grantedScope?: string;
  /** Redirect the final authorize hop to this URL instead of the registered `redirect_uri`. */
  readonly redirectOverride?: string;
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly cookie?: string;
  readonly body?: URLSearchParams;
}

const LOGIN_FIELDS: ReadonlySet<string> = new Set(['csrf', 'authorize_query', 'email', 'password']);
const CSRF_KEY = 'fake-csrf-key';
const EXPIRED = 'Thu, 01 Jan 1970 00:00:00 GMT';

function html(status: number, body: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  cookies.forEach((cookie) => headers.append('set-cookie', cookie));
  return new Response(body, { status, headers });
}

function redirect(location: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({ location });
  cookies.forEach((cookie) => headers.append('set-cookie', cookie));
  return new Response(null, { status: 302, headers });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function csrfField(nonce: string): string {
  return createHmac('sha256', CSRF_KEY).update(nonce).digest('base64url');
}

export class FakeAuthServer {
  readonly requests: RecordedRequest[] = [];
  private readonly sessions = new Map<string, string>();
  private readonly codes = new Map<string, { challenge: string; email: string }>();

  constructor(private readonly options: FakeAuthOptions) {}

  readonly fetch: FetchLike = async (url, init) => {
    const target = new URL(url);
    const method = init?.method ?? 'GET';
    const cookie = (init?.headers as Record<string, string> | undefined)?.['cookie'];
    const body = typeof init?.body === 'string' ? new URLSearchParams(init.body) : undefined;
    this.requests.push({ method, path: target.pathname, ...(cookie === undefined ? {} : { cookie }), ...(body === undefined ? {} : { body }) });
    if (method === 'GET' && target.pathname === '/oauth/authorize') {
      return this.authorize(target.searchParams, cookie);
    }
    if (method === 'POST' && target.pathname === '/oauth/login') {
      return this.login(body, cookie);
    }
    if (method === 'POST' && target.pathname === '/oauth/token') {
      return this.token(body);
    }
    return json(404, { error: 'not_found' });
  };

  private authorize(query: URLSearchParams, cookie: string | undefined): Response {
    if (query.get('client_id') !== this.options.clientId) {
      return json(401, { error: 'invalid_client', error_description: 'Unknown client_id' });
    }
    if (query.get('redirect_uri') !== this.options.redirectUri) {
      return json(400, { error: 'invalid_request', error_description: 'redirect_uri is not registered for this client' });
    }
    if (query.get('response_type') !== 'code' || query.get('code_challenge_method') !== 'S256' || !query.get('code_challenge')) {
      return json(400, { error: 'invalid_request' });
    }
    const sessionId = cookieValue(cookie, 'mc_as_session');
    const email = sessionId === undefined ? undefined : this.sessions.get(sessionId);
    if (sessionId === undefined || email === undefined) {
      return this.loginPage(query);
    }
    this.sessions.delete(sessionId);
    const code = randomUUID();
    this.codes.set(code, { challenge: query.get('code_challenge') ?? '', email });
    const target = new URL(this.options.redirectOverride ?? this.options.redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', query.get('state') ?? '');
    return redirect(target.toString());
  }

  private loginPage(query: URLSearchParams): Response {
    const nonce = randomBytes(32).toString('base64url');
    const page = renderLoginPage({ authorizeQuery: sanitizeAuthorizeQuery(query.toString()), csrfField: csrfField(nonce) });
    return html(200, page, [`mc_as_csrf=${nonce}; Path=/oauth; HttpOnly; SameSite=Strict`]);
  }

  private login(form: URLSearchParams | undefined, cookie: string | undefined): Response {
    if (this.options.loginStatus !== undefined) {
      return html(this.options.loginStatus, '<p>refused</p>');
    }
    if (form === undefined || [...form.keys()].some((field) => !LOGIN_FIELDS.has(field))) {
      return html(400, '<p>unexpected form fields</p>');
    }
    const nonce = cookieValue(cookie, 'mc_as_csrf');
    if (nonce === undefined || form.get('csrf') !== csrfField(nonce)) {
      return html(403, '<p>stale form</p>');
    }
    const email = form.get('email') ?? '';
    if (this.options.accounts[email] === undefined || this.options.accounts[email] !== form.get('password')) {
      return html(200, `<p class="error">Неверный адрес электронной почты или пароль. ${email}</p>`);
    }
    const sessionId = randomUUID();
    this.sessions.set(sessionId, email);
    return redirect(authorizeLocation(sanitizeAuthorizeQuery(form.get('authorize_query') ?? '')), [
      `mc_as_csrf=; Path=/oauth; Expires=${EXPIRED}; HttpOnly`,
      `mc_as_session=${sessionId}; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=300`,
    ]);
  }

  private token(form: URLSearchParams | undefined): Response {
    const stored = this.codes.get(form?.get('code') ?? '');
    const verifier = form?.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (form?.get('grant_type') !== 'authorization_code' || form.get('client_id') !== this.options.clientId || stored === undefined || stored.challenge !== challenge) {
      return json(400, { error: 'invalid_grant', error_description: 'Authorization code is invalid, expired or already used' });
    }
    this.codes.delete(form.get('code') ?? '');
    return json(200, {
      access_token: `jwt.for.${stored.email}`,
      token_type: 'Bearer',
      expires_in: 900,
      ...(this.options.grantedScope === undefined ? {} : { scope: this.options.grantedScope }),
    });
  }
}
