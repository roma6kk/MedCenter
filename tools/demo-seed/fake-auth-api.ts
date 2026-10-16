import type { FetchLike } from '../shared/fhir-http';
import { FakeAuthServer } from './fake-auth-server';

/** Test double of the account endpoints of auth-service, on top of the OAuth double. */

export const ADMIN_EMAIL = 'admin@medcenter.test';
export const ADMIN_PASSWORD = 'Adm1n!Passw0rd';

interface Call {
  readonly path: string;
  readonly authorization?: string;
}

/** The two account endpoints: admin creation (needs the admin's Bearer token) and public registration. */
function accountEndpoint(created: string[], calls: Call[], path: string, init: Parameters<FetchLike>[1]): Response {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ path, ...(headers['authorization'] === undefined ? {} : { authorization: headers['authorization'] }) });
  const body = JSON.parse(String(init?.body)) as { email: string };
  if (path === '/api/v1/admin/users' && headers['authorization'] !== `Bearer jwt.for.${ADMIN_EMAIL}`) {
    return new Response('{"errorCode":"UNAUTHORIZED"}', { status: 401 });
  }
  if (created.includes(body.email)) {
    return new Response('{"detail":"EMAIL_TAKEN: a user with this email already exists"}', { status: 409 });
  }
  created.push(body.email);
  return new Response(JSON.stringify({ id: `id-${created.length}` }), { status: 201 });
}

/** auth-service as the seed sees it: the OAuth endpoints and the two account endpoints. */
export function authService(
  accounts: Record<string, string> = { [ADMIN_EMAIL]: ADMIN_PASSWORD },
  grantedScope?: string,
): { readonly fetchImpl: FetchLike; readonly created: string[]; readonly calls: Call[] } {
  const oauth = new FakeAuthServer({
    clientId: 'medcenter-web',
    redirectUri: 'http://localhost:3000/api/auth/callback',
    accounts,
    ...(grantedScope === undefined ? {} : { grantedScope }),
  });
  const created: string[] = [];
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    return path.startsWith('/oauth') ? oauth.fetch(url, init) : accountEndpoint(created, calls, path, init);
  };
  return { fetchImpl, created, calls };
}
