import { authChecks } from './checks-auth';
import { SmokeRunner } from './smoke-runner';
import type { ApiResponse, Session, SmokeRole } from './smoke-types';
import type { Suite } from './suite';

const REGISTERED = 'user-registered';
const CREATED = 'user-created';

const session = (role: SmokeRole): Session => ({ email: `${role}@x`, role, accessToken: role, grantedScope: '', claims: {} });
const answer = (status: number, body: unknown): ApiResponse => ({ status, contentType: 'application/json', text: JSON.stringify(body), body });
const card = (id: string): Record<string, unknown> => ({ id, email: 'a@b', firstName: 'A', lastName: 'B', roles: [], isActive: true, externalLinks: [] });

interface FakeOptions {
  /** HTTP status of PATCH /admin/users/{id}; anything but 200 stops the admin chain right after the account was created. */
  readonly patchStatus: number;
  /** Ids whose DELETE answers 500. */
  readonly undeletable?: readonly string[];
}

function suiteWith(options: FakeOptions): { suite: Suite; deletes: string[] } {
  const deletes: string[] = [];
  const request = jest.fn(async (method: string, path: string): Promise<ApiResponse> => {
    if (method === 'POST' && path === '/api/v1/auth/register') {
      return answer(201, { ...card(REGISTERED), patientRef: 'Patient/1' });
    }
    if (method === 'POST') {
      return answer(201, card(CREATED));
    }
    if (method === 'PATCH') {
      return answer(options.patchStatus, { firstName: 'Изменённый' });
    }
    if (method === 'DELETE') {
      deletes.push(path.split('/').pop() ?? '');
      return options.undeletable?.includes(path.split('/').pop() ?? '') === true ? answer(500, {}) : answer(200, { isActive: false });
    }
    if (path === '/api/v1/admin/users') {
      return answer(200, { items: [card(CREATED)], meta: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } });
    }
    return answer(200, card(path.split('/').pop() ?? ''));
  });
  const api = { request, get: (path: string) => request('GET', path), post: (path: string) => request('POST', path), patch: (path: string) => request('PATCH', path), delete: (path: string) => request('DELETE', path) };
  const sessions = { admin: session('ADMIN'), doctor: session('DOCTOR'), patient: session('PATIENT') };
  return { suite: { runner: new SmokeRunner(), api, sessions } as unknown as Suite, deletes };
}

describe('authChecks cleanup', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should deactivate both test accounts when an early step of the admin chain fails', async () => {
    const { suite, deletes } = suiteWith({ patchStatus: 500 });

    await authChecks(suite);

    expect([...deletes].sort()).toEqual([CREATED, REGISTERED]);
  });

  it('should deactivate only the account a step could not, once, when the other was deactivated by the chain', async () => {
    const { suite, deletes } = suiteWith({ patchStatus: 200, undeletable: [REGISTERED] });

    await authChecks(suite);

    expect(deletes.filter((id) => id === CREATED)).toHaveLength(1);
    expect(deletes.filter((id) => id === REGISTERED)).toHaveLength(2);
  });

  it('should warn with the account id and keep going when the janitor cannot deactivate an account', async () => {
    const { suite } = suiteWith({ patchStatus: 500, undeletable: [CREATED] });

    await authChecks(suite);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`/admin/users/${CREATED} answered HTTP 500`));
  });
});
