/**
 * auth-config — configuration of the Next.js token broker (frontend-design-spec §2).
 *
 * The broker must never derive its public address from the incoming request:
 * in the standalone container the server listens on `HOSTNAME=0.0.0.0`, so
 * `request.nextUrl.origin` is `http://0.0.0.0:3000` — an origin that is not in the
 * OAuth client's redirect registry. The browser-visible origin is configuration:
 *
 * - `APP_PUBLIC_URL`      (preferred, runtime, server only)
 * - `NEXT_PUBLIC_APP_URL` (fallback, may be inlined at build time)
 * - default `http://localhost:3000` (the origin registered for the dev stack)
 *
 * The module is free of Node and React imports so the edge middleware can use it too.
 */

export const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000';
export const DEFAULT_AUTH_BACKEND_URL = 'http://medcenter.localhost:8081';
export const DEFAULT_OAUTH_CLIENT_ID = 'medcenter-web';
export const CALLBACK_PATH = '/api/auth/callback';

export type EnvSource = Readonly<Record<string, string | undefined>>;

function firstNonEmpty(...values: ReadonlyArray<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim();
}

function parseHttpOrigin(raw: string, variable: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${variable} must be an absolute http(s) URL, got "${raw}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variable} must use http or https, got "${url.protocol}"`);
  }
  return url.origin;
}

/** Browser-visible origin of the web client, e.g. `http://localhost:3000` (no trailing slash). */
export function resolvePublicOrigin(env: EnvSource = process.env): string {
  const configured: string | undefined = firstNonEmpty(env['APP_PUBLIC_URL'], env['NEXT_PUBLIC_APP_URL']);
  if (configured === undefined) return DEFAULT_PUBLIC_ORIGIN;
  const variable: string = firstNonEmpty(env['APP_PUBLIC_URL']) !== undefined ? 'APP_PUBLIC_URL' : 'NEXT_PUBLIC_APP_URL';
  return parseHttpOrigin(configured, variable);
}

/** Absolute URL of an app path on the public origin. `path` must start with a single `/`. */
export function publicUrl(path: string, env: EnvSource = process.env): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`publicUrl expects an absolute path, got "${path}"`);
  }
  return new URL(path, resolvePublicOrigin(env));
}

/** The `redirect_uri` registered for the `medcenter-web` client. */
export function resolveRedirectUri(env: EnvSource = process.env): string {
  return publicUrl(CALLBACK_PATH, env).toString();
}

/** Base URL of auth-service as seen by the browser AND the web server (see docker-compose `web`). */
export function resolveAuthBackendUrl(env: EnvSource = process.env): string {
  const configured: string | undefined = firstNonEmpty(env['AUTH_BACKEND_URL']);
  return (configured ?? DEFAULT_AUTH_BACKEND_URL).replace(/\/+$/, '');
}

export function resolveOauthClientId(env: EnvSource = process.env): string {
  return firstNonEmpty(env['OAUTH_CLIENT_ID']) ?? DEFAULT_OAUTH_CLIENT_ID;
}

/**
 * `Secure` is only valid on https: a Secure cookie on a plain-http origin is dropped by some
 * browsers, which would silently break the login of the dev stack served over http://localhost.
 */
export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://');
}
