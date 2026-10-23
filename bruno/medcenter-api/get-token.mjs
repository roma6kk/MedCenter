#!/usr/bin/env node
// Prints an access token (JWT) obtained through the real Authorization Code + PKCE flow of
// auth-service (API 2.1): authorize -> login form -> code -> token. Node 18+, no dependencies.
//
//   BRUNO_EMAIL=... BRUNO_PASSWORD=... node get-token.mjs
//
// Optional: BRUNO_BASE_URL (default http://localhost:8081), BRUNO_CLIENT_ID (medcenter-web),
// BRUNO_REDIRECT_URI (http://localhost:3000/api/auth/callback; it is read, never requested),
// BRUNO_SCOPE. The password is read from the environment only and is never printed; the token goes
// to stdout and nothing else does, so `TOKEN=$(node get-token.mjs)` works. `--json` prints the whole token
// response instead (it includes the refresh_token, needed by requests 2.1.3 refresh and 2.1.4 revoke).
import { createHash, randomBytes } from 'node:crypto';

const env = process.env;
const baseUrl = (env.BRUNO_BASE_URL ?? 'http://localhost:8081').replace(/\/+$/, '');
const clientId = env.BRUNO_CLIENT_ID ?? 'medcenter-web';
const redirectUri = env.BRUNO_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback';
const scope = env.BRUNO_SCOPE ?? 'launch patient/*.read patient/*.write user/*.read user/*.write';

const fail = (message) => {
  process.stderr.write(`get-token: ${message}\n`);
  process.exit(1);
};
if (!env.BRUNO_EMAIL || !env.BRUNO_PASSWORD) fail('set BRUNO_EMAIL and BRUNO_PASSWORD');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname)) fail('only a local base URL is allowed');

const cookies = new Map();
const store = (response) => {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1));
  }
};
const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
const unescapeHtml = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[m]);
const inputValue = (html, name) => {
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    if (new RegExp(`\\sname="${name}"`).test(tag)) return unescapeHtml(/\svalue="([^"]*)"/.exec(tag)?.[1] ?? '');
  }
  return '';
};

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('base64url');
const authorizeUrl = `${baseUrl}/oauth/authorize?${new URLSearchParams({
  response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope, state,
  code_challenge: challenge, code_challenge_method: 'S256',
})}`;

const page = await fetch(authorizeUrl, { redirect: 'manual' });
store(page);
if (page.status !== 200) fail(`authorize answered HTTP ${page.status}, expected the login page`);
const html = await page.text();
const csrf = inputValue(html, 'csrf');
const authorizeQuery = inputValue(html, 'authorize_query');
if (!csrf || !authorizeQuery) fail('the page is not the login form');

const login = await fetch(`${baseUrl}/oauth/login`, {
  method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
  body: new URLSearchParams({ csrf, authorize_query: authorizeQuery, email: env.BRUNO_EMAIL, password: env.BRUNO_PASSWORD }),
});
store(login);
if (login.status < 300 || login.status > 399) fail(`login refused (HTTP ${login.status}: wrong credentials, stale form or rate limit of 10 per minute)`);

const resumed = await fetch(new URL(login.headers.get('location'), baseUrl), { redirect: 'manual', headers: { cookie: cookieHeader() } });
const target = new URL(resumed.headers.get('location') ?? '', redirectUri);
if (target.searchParams.get('error')) fail(`authorization error: ${target.searchParams.get('error')}`);
if (target.searchParams.get('state') !== state) fail('state mismatch');
const code = target.searchParams.get('code');
if (!code) fail('no authorization code in the redirect');

const token = await fetch(`${baseUrl}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }),
});
if (!token.ok) fail(`token endpoint answered HTTP ${token.status}`);
const grant = await token.json();
if (typeof grant.access_token !== 'string') fail('the response carries no access_token');
process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(grant)}\n` : `${grant.access_token}\n`);
