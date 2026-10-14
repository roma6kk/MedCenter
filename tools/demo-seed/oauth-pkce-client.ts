import { createHash, randomBytes } from 'node:crypto';

import type { FetchLike } from '../shared/fhir-http';
import { randomState } from './demo-credentials';
import { OAuthFlowError } from './oauth-flow-error';
import { OAuthCookieJar } from './oauth-cookie-jar';
import { parseLoginForm, type LoginForm } from './oauth-login-form';

export { OAuthFlowError };

/**
 * Programmatic SMART / OAuth2 Authorization Code + PKCE login against
 * auth-service (API §2.1), replaying the browser round trip by hand:
 *
 *  1. `GET /oauth/authorize?...`  — no session yet, so the server answers its
 *     login page (200 HTML) and sets the `mc_as_csrf` cookie;
 *  2. `POST /oauth/login`          — form-encoded `email`, `password`, `csrf`,
 *     `authorize_query` plus the CSRF cookie; `302` back to `/oauth/authorize`
 *     with the single-use `mc_as_session` cookie;
 *  3. `GET /oauth/authorize?...`   — with the session cookie; `302` to the
 *     registered `redirect_uri?code=...&state=...`;
 *  4. `POST /oauth/token`          — `authorization_code` + `code_verifier`.
 *
 * Redirects are read, never followed: the final hop goes to the client's own
 * `redirect_uri` (the web app), which this tool never requests. The shapes
 * mirror `apps/auth-service/src/modules/oauth/login` and are pinned by a
 * contract test that renders the real login page.
 */

export interface OAuthConfig {
  /** Origin of the auth endpoints, e.g. the Traefik dev edge `http://localhost:8081`. */
  readonly authBaseUrl: string;
  readonly clientId: string;
  /** Must be one of the client's registered redirect URIs; it is never requested. */
  readonly redirectUri: string;
  readonly scope: string;
}

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

const VERIFIER_BYTES = 32;
const EXCERPT_LENGTH = 300;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

interface FlowContext {
  readonly config: OAuthConfig;
  readonly pkce: PkcePair;
  readonly state: string;
  readonly jar: OAuthCookieJar;
  readonly fetchImpl: FetchLike;
}

/** RFC 7636: `challenge = BASE64URL(SHA256(verifier))`, method S256. */
export function createPkcePair(random: (size: number) => Buffer = randomBytes): PkcePair {
  const verifier = random(VERIFIER_BYTES).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function buildAuthorizeUrl(config: OAuthConfig, pkce: PkcePair, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  });
  return `${config.authBaseUrl}/oauth/authorize?${params.toString()}`;
}

/**
 * The `code` of a redirect to `redirect_uri`. An `error` parameter, a foreign
 * target, a `state` mismatch (CSRF) or a missing code are all failures.
 */
export function readAuthorizationCode(location: string, redirectUri: string, expectedState: string): string {
  const target = new URL(location, redirectUri);
  if (`${target.origin}${target.pathname}` !== redirectUri.split('?')[0]) {
    throw new OAuthFlowError('authorize', `redirected to ${target.origin}${target.pathname}, not to the redirect_uri`);
  }
  const error = target.searchParams.get('error');
  if (error !== null) {
    throw new OAuthFlowError('authorize', `authorization server answered error=${error}`);
  }
  if (target.searchParams.get('state') !== expectedState) {
    throw new OAuthFlowError('authorize', 'state does not match the request');
  }
  const code = target.searchParams.get('code');
  if (code === null || code.length === 0) {
    throw new OAuthFlowError('authorize', 'redirect carries no authorization code');
  }
  return code;
}

function excerptOf(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, EXCERPT_LENGTH);
}

/** Cookies and credentials only ever travel to the origin the tool was pointed at. */
function sameOriginUrl(config: OAuthConfig, target: string, step: 'authorize' | 'login'): string {
  const resolved = new URL(target, config.authBaseUrl);
  if (resolved.origin !== new URL(config.authBaseUrl).origin) {
    throw new OAuthFlowError(step, `refusing to follow ${resolved.origin}, it is not the auth origin`);
  }
  return resolved.toString();
}

function redirectLocation(response: Response, step: 'authorize' | 'login'): string {
  const location = response.headers.get('location');
  if (!REDIRECT_STATUSES.has(response.status) || location === null) {
    throw new OAuthFlowError(step, `expected a redirect, got HTTP ${response.status}`);
  }
  return location;
}

async function openLoginPage(context: FlowContext): Promise<LoginForm> {
  const { config, pkce, state, jar, fetchImpl } = context;
  const response = await fetchImpl(buildAuthorizeUrl(config, pkce, state), { method: 'GET', redirect: 'manual' });
  jar.store(response);
  const text = await response.text();
  if (response.status !== 200) {
    const bounce = REDIRECT_STATUSES.has(response.status) ? ` (redirect to ${response.headers.get('location') ?? '?'})` : '';
    throw new OAuthFlowError('authorize', `expected the login page, got HTTP ${response.status}${bounce}: ${excerptOf(text)}`);
  }
  return parseLoginForm(text);
}

/** Why the login form did not lead to a redirect — never echoes the page body, which repeats the email. */
function describeLoginRefusal(status: number): string {
  switch (status) {
    case 200:
      return 'credentials rejected (wrong email or password, or the account is inactive)';
    case 403:
      return 'the login form is stale (CSRF check failed)';
    case 429:
      return 'rate limit reached (10 login attempts per minute per address)';
    default:
      return `unexpected answer HTTP ${status}`;
  }
}

async function submitCredentials(context: FlowContext, form: LoginForm, credentials: LoginCredentials): Promise<string> {
  const { config, jar, fetchImpl } = context;
  const cookie = jar.header();
  const response = await fetchImpl(sameOriginUrl(config, form.action, 'login'), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie.length === 0 ? {} : { cookie }),
    },
    // Exactly the four fields of the form (`LoginFormDto`): the DTO is validated against that whitelist.
    body: new URLSearchParams({
      csrf: form.csrf,
      authorize_query: form.authorizeQuery,
      email: credentials.email,
      password: credentials.password,
    }).toString(),
  });
  jar.store(response);
  if (!REDIRECT_STATUSES.has(response.status)) {
    throw new OAuthFlowError('login', describeLoginRefusal(response.status));
  }
  return redirectLocation(response, 'login');
}

async function resumeAuthorization(context: FlowContext, location: string): Promise<string> {
  const { config, state, jar, fetchImpl } = context;
  const cookie = jar.header();
  const response = await fetchImpl(sameOriginUrl(config, location, 'authorize'), {
    method: 'GET',
    redirect: 'manual',
    ...(cookie.length === 0 ? {} : { headers: { cookie } }),
  });
  return readAuthorizationCode(redirectLocation(response, 'authorize'), config.redirectUri, state);
}

async function exchangeCode(context: FlowContext, code: string): Promise<string> {
  const { config, pkce, fetchImpl } = context;
  const response = await fetchImpl(`${config.authBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: pkce.verifier,
    }).toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new OAuthFlowError('token', `HTTP ${response.status}: ${excerptOf(text)}`);
  }
  const body = JSON.parse(text) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new OAuthFlowError('token', 'response carries no access_token');
  }
  return body.access_token;
}

/** Runs the whole flow and returns the access token (a Bearer JWT). The password is never logged. */
export async function obtainAccessToken(
  config: OAuthConfig,
  credentials: LoginCredentials,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<string> {
  const context: FlowContext = {
    config,
    pkce: createPkcePair(),
    state: randomState(),
    jar: new OAuthCookieJar(),
    fetchImpl,
  };
  const form = await openLoginPage(context);
  const location = await submitCredentials(context, form, credentials);
  const code = await resumeAuthorization(context, location);
  return exchangeCode(context, code);
}
