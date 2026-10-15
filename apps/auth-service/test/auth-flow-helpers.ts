import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { decodeClaims } from '../src/modules/oauth/__tests__/oauth-harness';
import { cookiesOf } from './app-harness';
import { E2E_CLIENT_ID, E2E_REDIRECT_URI } from './e2e-env';

/** RFC 7636 appendix B: `PKCE_CHALLENGE` is the S256 challenge of `PKCE_VERIFIER`. */
export const PKCE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
export const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

/** What `frontend/src/app/api/auth/authorize/route.ts` asks for: every scope, narrowed per role by the server. */
export const BROWSER_SCOPES = 'launch patient/*.read patient/*.write user/*.read user/*.write';

export const PATIENT_PASSWORD = 'Str0ng!Pass';

export function authorizeQuery(state = 'state-1'): string {
  return new URLSearchParams({
    response_type: 'code',
    client_id: E2E_CLIENT_ID,
    redirect_uri: E2E_REDIRECT_URI,
    scope: BROWSER_SCOPES,
    state,
    code_challenge: PKCE_CHALLENGE,
    code_challenge_method: 'S256',
  }).toString();
}

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** A hidden `<input>` value as the browser would submit it (entities decoded). */
export function hiddenField(html: string, name: string): string {
  const match = new RegExp(`<input type="hidden" name="${name}" value="([^"]*)">`).exec(html);
  return (match?.[1] ?? '').replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

export interface LoginForm {
  /** `name=value` of the CSRF cookie the browser stores with the form. */
  readonly csrfCookie: string;
  readonly csrfField: string;
  readonly authorizeQuery: string;
  readonly html: string;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** The first leg: the browser is sent to `GET /oauth/authorize` without a login session. */
export async function openLoginForm(app: INestApplication, query = authorizeQuery()): Promise<LoginForm> {
  const response = await request(app.getHttpServer()).get(`/oauth/authorize?${query}`).redirects(0).expect(200);
  return {
    csrfCookie: cookiesOf(response.headers['set-cookie'])[0] ?? '',
    csrfField: hiddenField(response.text, 'csrf'),
    authorizeQuery: hiddenField(response.text, 'authorize_query'),
    html: response.text,
  };
}

/** The second leg: the form posted back, exactly as a browser submits it. */
export function submitLogin(app: INestApplication, form: LoginForm, credentials: Credentials): request.Test {
  return request(app.getHttpServer())
    .post('/oauth/login')
    .set('Cookie', form.csrfCookie)
    .type('form')
    .send({ ...credentials, csrf: form.csrfField, authorize_query: form.authorizeQuery })
    .redirects(0);
}

export interface TokenBody {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly scope: string;
  readonly patient?: string;
}

/** Runs the whole browser flow for `credentials` and returns the token response. */
export async function signIn(app: INestApplication, credentials: Credentials): Promise<TokenBody> {
  const form = await openLoginForm(app);
  const login = await submitLogin(app, form, credentials).expect(302);
  const sessionCookie = cookiesOf(login.headers['set-cookie']).join('; ');
  const authorized = await request(app.getHttpServer())
    .get(String(login.headers['location']))
    .set('Cookie', sessionCookie)
    .redirects(0)
    .expect(302);
  const code = new URL(String(authorized.headers['location'])).searchParams.get('code') ?? '';
  const token = await request(app.getHttpServer())
    .post('/oauth/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      client_id: E2E_CLIENT_ID,
      code_verifier: PKCE_VERIFIER,
    })
    .expect(200);
  return token.body as TokenBody;
}

export function claimsOfToken(token: TokenBody): Record<string, unknown> {
  return decodeClaims(token.access_token);
}

export function bearer(token: TokenBody): string {
  return `Bearer ${token.access_token}`;
}
