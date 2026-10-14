import type { FetchLike } from '../shared/fhir-http';
import { FakeAuthServer } from './fake-auth-server';

/** Test double of the account endpoints of auth-service, on top of the OAuth double. */

export const ADMIN_EMAIL = 'admin@medcenter.test';
export const ADMIN_PASSWORD = 'Adm1n!Passw0rd';

/** auth-service as the seed sees it: the OAuth endpoints and the two account endpoints. */
export function authService(accounts: Record<string, string> = { [ADMIN_EMAIL]: ADMIN_PASSWORD }): {
  readonly fetchImpl: FetchLike;
  readonly created: string[];
  readonly calls: Array<{ path: string; authorization?: string }>;
} {
  const oauth = new FakeAuthServer({
    clientId: 'medcenter-web',
    redirectUri: 'http://localhost:3000/api/auth/callback',
    accounts,
  });
  const created: string[] = [];
  const calls: Array<{ path: string; authorization?: string }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/oauth')) {
      return oauth.fetch(url, init);
    }
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
  };
  return { fetchImpl, created, calls };
}

