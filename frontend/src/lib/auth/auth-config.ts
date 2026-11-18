// Never derive the public origin from the request: behind the container request.nextUrl.origin is http://0.0.0.0:3000, not a registered redirect URI.

export const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000';
export const DEFAULT_AUTH_BACKEND_URL = 'http://medcenter.localhost:8081';
export const DEFAULT_OAUTH_CLIENT_ID = 'medcenter-web';
const CALLBACK_PATH = '/api/auth/callback';

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

export function resolvePublicOrigin(env: EnvSource = process.env): string {
  const configured: string | undefined = firstNonEmpty(env['APP_PUBLIC_URL'], env['NEXT_PUBLIC_APP_URL']);
  if (configured === undefined) return DEFAULT_PUBLIC_ORIGIN;
  const variable = firstNonEmpty(env['APP_PUBLIC_URL']) !== undefined ? 'APP_PUBLIC_URL' : 'NEXT_PUBLIC_APP_URL';
  return parseHttpOrigin(configured, variable);
}

export function publicUrl(path: string, env: EnvSource = process.env): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`publicUrl expects an absolute path, got "${path}"`);
  }
  return new URL(path, resolvePublicOrigin(env));
}

export function resolveRedirectUri(env: EnvSource = process.env): string {
  return publicUrl(CALLBACK_PATH, env).toString();
}

export function resolveAuthBackendUrl(env: EnvSource = process.env): string {
  const configured: string | undefined = firstNonEmpty(env['AUTH_BACKEND_URL']);
  return (configured ?? DEFAULT_AUTH_BACKEND_URL).replace(/\/+$/, '');
}

export function resolveOauthClientId(env: EnvSource = process.env): string {
  return firstNonEmpty(env['OAUTH_CLIENT_ID']) ?? DEFAULT_OAUTH_CLIENT_ID;
}

// Secure is only valid on https: some browsers drop a Secure cookie on plain http://localhost, which would break the dev-stack login.
export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith('https://');
}
