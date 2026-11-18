import { randomBytes } from 'node:crypto';

import { asArray, bodyObject, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { signIn } from './smoke-session';
import { USER_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { ApiResponse } from './smoke-types';
import { runTag, type Suite } from './suite';

const GROUP = 'auth-service';
const CARD_SHAPE = { ...USER_SHAPE, externalLinks: 'array' } as const;
const ADMIN_USERS = '/api/v1/admin/users';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

export function newPassword(): string {
  return `Sm0ke!${randomBytes(9).toString('hex')}Aa`;
}

function idOf(response: ApiResponse): string {
  const id = (response.body as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : '';
}

interface TestUsers {
  registered: string;
  created: string;
  readonly deactivated: Set<string>;
}

async function deactivate(suite: Suite, users: TestUsers, id: string): Promise<ApiResponse> {
  const response = await suite.api.delete(`${ADMIN_USERS}/${id}`, { session: suite.sessions.admin });
  if (response.status === 200) {
    users.deactivated.add(id);
  }
  return response;
}

async function deactivateLeftovers(suite: Suite, users: TestUsers): Promise<void> {
  for (const id of [users.registered, users.created].filter((candidate) => candidate !== '' && !users.deactivated.has(candidate))) {
    const response = await deactivate(suite, users, id);
    if (response.status !== 200) {
      console.warn(`cleanup: DELETE ${ADMIN_USERS}/${id} answered HTTP ${response.status}; deactivate the test account by hand`);
    }
  }
}

async function meChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions } = suite;
  for (const [label, session] of [['admin', sessions.admin], ['doctor', sessions.doctor], ['patient', sessions.patient]] as const) {
    await runner.check(GROUP, `GET /me as ${label} -> own profile`, async () => {
      const response = await api.get('/api/v1/me', { session });
      expectStatus(response, 200);
      expectEqual(expectShape(response.body, CARD_SHAPE, 'me')['email'], session.email, 'email of /me');
    });
  }
}

async function registrationChecks(suite: Suite, email: string, users: TestUsers): Promise<void> {
  const { runner, api } = suite;
  const body = { email, password: newPassword(), firstName: 'Смоук', lastName: 'Тестов', birthDate: '1991-02-03', gender: 'female', accountConsent: { accepted: true, textVersion: '2026-10' } };
  await runner.check(GROUP, 'POST /auth/register (public) -> 201 PATIENT with a FHIR Patient', async () => {
    const response = await api.post('/api/v1/auth/register', { body });
    expectStatus(response, 201);
    users.registered = idOf(response);
    const created = expectShape(response.body, USER_SHAPE, 'registered user');
    expectTrue(/^Patient\/.+/.test(String(created['patientRef'])), 'registration did not link a FHIR Patient');
  });
  await runner.check(GROUP, 'POST /me/password as the new patient -> 204', async () => {
    const session = await signIn(suite.config, { role: 'PATIENT', email, password: body.password });
    const response = await api.post('/api/v1/me/password', { session, body: { currentPassword: body.password, newPassword: newPassword() } });
    expectStatus(response, 204);
  });
  await runner.check(GROUP, 'POST /auth/register with a taken email -> 409', async () => {
    expectProblem(await api.post('/api/v1/auth/register', { body }), 409, 'CONFLICT');
  });
  await runner.check(GROUP, 'POST /auth/register with a bad body -> 400 VALIDATION_ERROR naming the fields', async () => {
    const response = await api.post('/api/v1/auth/register', { body: { email: 'not-an-email', password: 'x' } });
    expectProblem(response, 400, 'VALIDATION_ERROR');
    const problem = bodyObject(response);
    expectTrue(/email/i.test(String(problem['detail'])), `the problem detail does not name the offending field: "${String(problem['detail'])}"`);
    expectTrue(asArray(problem['details'], 'details').length > 0, 'details[] is empty');
  });
}

function createStep(suite: Suite, email: string, users: TestUsers): SmokeStep {
  return {
    name: 'POST /admin/users -> 201 DOCTOR account',
    run: async () => {
      const body = { email, password: newPassword(), firstName: 'Админ', lastName: 'Созданный', roles: ['DOCTOR'] };
      const response = await suite.api.post(ADMIN_USERS, { session: suite.sessions.admin, body });
      expectStatus(response, 201);
      users.created = idOf(response);
      expectShape(response.body, CARD_SHAPE, 'created user');
    },
  };
}

function createAndReadSteps(suite: Suite, email: string, users: TestUsers): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    createStep(suite, email, users),
    {
      name: 'GET /admin/users?role=DOCTOR&search= -> envelope containing the new account',
      run: async () => {
        const items = expectPage(await api.get(ADMIN_USERS, { session, query: { role: 'DOCTOR', search: email, pageSize: 5 } }), USER_SHAPE);
        expectTrue(items.some((item) => item['id'] === users.created), 'the new account is not in the filtered list');
      },
    },
    {
      name: 'GET /admin/users/{id} -> the card',
      run: async () => {
        const response = await api.get(`${ADMIN_USERS}/${users.created}`, { session });
        expectStatus(response, 200);
        expectEqual(expectShape(response.body, CARD_SHAPE, 'user card')['id'], users.created, 'id');
      },
    },
  ];
}

function changeAndDeactivateSteps(suite: Suite, users: TestUsers): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'PATCH /admin/users/{id} -> 200 with the new name',
      run: async () => {
        const response = await api.patch(`${ADMIN_USERS}/${users.created}`, { session, body: { firstName: 'Изменённый' } });
        expectStatus(response, 200);
        expectEqual(bodyObject(response)['firstName'], 'Изменённый', 'firstName');
      },
    },
    {
      name: 'DELETE /admin/users/{id} -> 200, the account is deactivated (soft delete)',
      run: async () => {
        const response = await deactivate(suite, users, users.created);
        expectStatus(response, 200);
        expectEqual(bodyObject(response)['isActive'], false, 'isActive');
      },
    },
    {
      name: 'DELETE /admin/users/{self-registered} -> deactivated too (the run leaves no active test account)',
      run: async () => expectStatus(await deactivate(suite, users, users.registered), 200),
    },
  ];
}

async function adminUserChecks(suite: Suite, email: string, users: TestUsers): Promise<void> {
  const { runner, api, sessions } = suite;
  await runner.chain(GROUP, [...createAndReadSteps(suite, email, users), ...changeAndDeactivateSteps(suite, users)]);
  await runner.check(GROUP, 'GET /admin/users/{unknown uuid} -> 404 NOT_FOUND', async () => {
    expectProblem(await api.get(`${ADMIN_USERS}/${UNKNOWN_UUID}`, { session: sessions.admin }), 404, 'NOT_FOUND');
  });
  await runner.check(GROUP, 'GET /admin/users/retention-expired -> page of closed accounts past retention, nothing deleted', async () => {
    const items = expectPage(await api.get(`${ADMIN_USERS}/retention-expired`, { session: sessions.admin, query: { pageSize: 5 } }));
    expectTrue(items.every((item) => typeof item['retentionUntil'] === 'string' && Date.parse(String(item['retentionUntil'])) <= Date.now()), 'a listed account is still within retention');
  });
}

export async function authChecks(suite: Suite): Promise<void> {
  const tag = runTag();
  const users: TestUsers = { registered: '', created: '', deactivated: new Set() };
  await meChecks(suite);
  await registrationChecks(suite, `smoke.patient.${tag}@medcenter.test`, users);
  await adminUserChecks(suite, `smoke.doctor.${tag}@medcenter.test`, users);
  await deactivateLeftovers(suite, users);
}
