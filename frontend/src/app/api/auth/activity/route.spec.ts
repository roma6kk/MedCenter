/** @jest-environment node */
import { NextRequest } from 'next/server';
import { jsonResponse } from '@/lib/auth/jwt-fixture';
import { POST } from './route';

function ping(bearer: string | null): Promise<Response> {
  const headers: Record<string, string> = bearer === null ? {} : { authorization: `Bearer ${bearer}` };
  return POST(new NextRequest('http://0.0.0.0:3000/api/auth/activity', { method: 'POST', headers }));
}

describe('POST /api/auth/activity', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env['AUTH_BACKEND_URL'] = 'http://auth.test:3000';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('should answer 401 without calling auth-service when there is no Bearer', async () => {
    const response = await ping(null);

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should forward the Bearer to the activity endpoint and report it recorded', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ recorded: true }));

    const response = await ping('access-1');

    expect(response.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://auth.test:3000/oauth/token/activity');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });

  it('should report a session the server already considers idle as not recorded', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ recorded: false }));

    const response = await ping('access-1');

    expect(await response.json()).toEqual({ recorded: false });
  });

  it('should relay an expired Bearer as 401 so the client refreshes and retries', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ errorCode: 'UNAUTHENTICATED' }, 401));

    expect((await ping('stale')).status).toBe(401);
  });

  it('should answer 503 when auth-service is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect((await ping('access-1')).status).toBe(503);
  });
});
