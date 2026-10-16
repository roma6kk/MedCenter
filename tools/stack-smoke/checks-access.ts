import { PROTECTED_ROUTES, roleProbesFor, type ExpectedRefusal, type ProtectedRoute, type RoleProbe } from './access-matrix';
import { bodyObject, expectProblem, expectTrue } from './smoke-assert';
import type { Session, SmokeRole } from './smoke-types';
import type { Suite } from './suite';

const GROUP = 'access (401 / 403)';
const ACCEPTED_CODES: Readonly<Record<ExpectedRefusal, readonly string[]>> = {
  FORBIDDEN_ROLE: ['FORBIDDEN_ROLE'],
  FORBIDDEN_ROLE_OR_SCOPE: ['FORBIDDEN_ROLE', 'FORBIDDEN_SCOPE'],
};

interface Probe extends RoleProbe {
  readonly entry: ProtectedRoute;
}

function sessionOf(suite: Suite, role: SmokeRole): Session {
  const { sessions } = suite;
  return role === 'ADMIN' ? sessions.admin : role === 'DOCTOR' ? sessions.doctor : sessions.patient;
}

function label(entry: ProtectedRoute): string {
  return `${entry.method} ${entry.path.split('?')[0]}`;
}

/** No token (and a garbage token) -> 401 UNAUTHENTICATED on every protected route. */
async function unauthenticatedChecks(suite: Suite): Promise<void> {
  const { runner, api } = suite;
  await runner.check(GROUP, `no token -> 401 UNAUTHENTICATED on all ${PROTECTED_ROUTES.length} protected routes`, async () => {
    const failures: string[] = [];
    for (const entry of PROTECTED_ROUTES) {
      const response = await api.request(entry.method, entry.path);
      const code = response.status === 401 ? String(bodyObject(response)['errorCode']) : `HTTP ${response.status}`;
      if (code !== 'UNAUTHENTICATED') {
        failures.push(`${label(entry)} -> ${code}`);
      }
    }
    expectTrue(failures.length === 0, `routes that answered something else than 401 UNAUTHENTICATED: ${failures.join('; ')}`);
  });
  await runner.check(GROUP, 'a malformed or foreign bearer token -> 401', async () => {
    for (const authorization of ['Bearer not-a-jwt', 'Bearer aaa.bbb.ccc', 'Basic Zm9vOmJhcg==']) {
      expectProblem(await api.get('/api/v1/appointments', { authorization }), 401, 'UNAUTHENTICATED');
    }
  });
}

/** Every (route, wrong role) pair the matrix defines, split by what the refusal must prove. */
function probesOf(expected: ExpectedRefusal): Probe[] {
  return PROTECTED_ROUTES.flatMap((entry) => roleProbesFor(entry).filter((probe) => probe.expected === expected).map((probe) => ({ ...probe, entry })));
}

/** Calls each probe with the token of its role; the answer must be 403 with one of the accepted codes. */
async function refusalFailures(suite: Suite, probes: readonly Probe[]): Promise<string[]> {
  const failures: string[] = [];
  for (const { entry, role, expected } of probes) {
    const response = await suite.api.request(entry.method, entry.path, { session: sessionOf(suite, role) });
    const code = response.status === 403 ? String(bodyObject(response)['errorCode']) : `HTTP ${response.status}`;
    if (!ACCEPTED_CODES[expected].includes(code)) {
      failures.push(`${label(entry)} as ${role} -> ${code}`);
    }
  }
  return failures;
}

/**
 * Wrong role -> 403. The first check isolates RoleGuard (the probe holds the route's scopes, so the answer
 * must be exactly FORBIDDEN_ROLE); the second covers the roles that lack the scopes as well.
 */
export async function wrongRoleChecks(suite: Suite): Promise<void> {
  const isolating = probesOf('FORBIDDEN_ROLE');
  await suite.runner.check(GROUP, `RoleGuard alone: a role that holds the route's scopes -> exactly 403 FORBIDDEN_ROLE (${isolating.length} probes: DOCTOR on admin routes, ADMIN on doctor routes)`, async () => {
    const failures = await refusalFailures(suite, isolating);
    expectTrue(failures.length === 0, `probes that were not refused with FORBIDDEN_ROLE: ${failures.join('; ')}`);
  });
  const others = probesOf('FORBIDDEN_ROLE_OR_SCOPE');
  await suite.runner.check(GROUP, `a role without the route's scopes -> 403 FORBIDDEN_ROLE or FORBIDDEN_SCOPE (${others.length} probes)`, async () => {
    const failures = await refusalFailures(suite, others);
    expectTrue(failures.length === 0, `probes that were not refused with 403: ${failures.join('; ')}`);
  });
}

export async function accessChecks(suite: Suite): Promise<void> {
  await unauthenticatedChecks(suite);
  await wrongRoleChecks(suite);
  await suite.runner.check(GROUP, 'a patient token on a staff-only terminology route -> 403 FORBIDDEN_SCOPE', async () => {
    const response = await suite.api.get('/api/v1/terminology/expand', { session: suite.sessions.patient, query: { system: 'https://fhir.by/ValueSet/atc' } });
    expectProblem(response, 403, 'FORBIDDEN_SCOPE');
  });
}
