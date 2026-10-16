import { PROTECTED_ROUTES, roleProbesFor } from './access-matrix';
import { wrongRoleChecks } from './checks-access';
import { SmokeRunner } from './smoke-runner';
import type { ApiResponse, Session, SmokeRole } from './smoke-types';
import type { Suite } from './suite';

const session = (role: SmokeRole): Session => ({ email: `${role}@x`, role, accessToken: role, grantedScope: '', claims: {} });

function refusal(code: string): ApiResponse {
  return { status: 403, contentType: 'application/problem+json', text: '', body: { errorCode: code } };
}

/** A stack whose guards refuse every wrong role with `code`, except where `answer` says otherwise. */
function suiteAnswering(answer: (method: string, path: string, role: SmokeRole) => ApiResponse | undefined, code: string): Suite {
  const request = jest.fn(async (method: string, path: string, options?: { session?: Session }) => {
    const role = options?.session?.role ?? 'PATIENT';
    return answer(method, path, role) ?? refusal(code);
  });
  const sessions = { admin: session('ADMIN'), doctor: session('DOCTOR'), patient: session('PATIENT') };
  return { runner: new SmokeRunner(), api: { request }, sessions } as unknown as Suite;
}

const outcomes = (suite: Suite): string[] => suite.runner.results.map((result) => result.outcome);

describe('wrongRoleChecks', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass both checks when every wrong role is refused by the guard that applies', async () => {
    const suite = suiteAnswering(() => undefined, 'FORBIDDEN_ROLE');

    await wrongRoleChecks(suite);

    expect(outcomes(suite)).toEqual(['PASS', 'PASS']);
  });

  it('should fail the RoleGuard check when a doctor gets through an admin route that lost its role requirement', async () => {
    const suite = suiteAnswering((method, path, role) => (role === 'DOCTOR' && method === 'POST' && path === '/api/v1/admin/rooms' ? { status: 201, contentType: '', text: '', body: {} } : undefined), 'FORBIDDEN_ROLE');

    await wrongRoleChecks(suite);

    const [isolated] = suite.runner.results;
    expect(isolated?.outcome).toBe('FAIL');
    expect(isolated?.detail).toContain('POST /api/v1/admin/rooms as DOCTOR -> HTTP 201');
  });

  it('should fail the RoleGuard check when a scope refusal answers where only the role could refuse', async () => {
    const suite = suiteAnswering((_method, _path, role) => (role === 'DOCTOR' ? refusal('FORBIDDEN_SCOPE') : undefined), 'FORBIDDEN_ROLE');

    await wrongRoleChecks(suite);

    expect(suite.runner.results[0]?.outcome).toBe('FAIL');
    expect(suite.runner.results[1]?.outcome).toBe('PASS');
  });

  it('should probe the number of routes the matrix defines', async () => {
    const suite = suiteAnswering(() => undefined, 'FORBIDDEN_ROLE');

    await wrongRoleChecks(suite);

    const probes = PROTECTED_ROUTES.flatMap((route) => roleProbesFor(route)).length;
    expect((suite.api.request as jest.Mock).mock.calls).toHaveLength(probes);
  });
});
