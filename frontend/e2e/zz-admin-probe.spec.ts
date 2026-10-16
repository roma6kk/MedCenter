import { test, expect } from './fixtures/auth';

const PATHS = [
  '/api/v1/admin/users?pageSize=3',
  '/api/v1/admin/users?role=DOCTOR&pageSize=100',
  '/api/v1/services?pageSize=3',
  '/api/v1/rooms?pageSize=3',
  '/api/v1/admin/schedules?pageSize=2',
  '/api/v1/admin/analytics/appointments',
  '/api/v1/admin/analytics/encounters',
  '/api/v1/admin/analytics/services-popularity?top=3',
  '/api/v1/admin/audit?pageSize=3',
  '/api/v1/terminology/value-sets',
  '/api/v1/doctors?pageSize=3',
];

test('probe', async ({ adminPage }) => {
  const result = await adminPage.evaluate(async (paths: string[]) => {
    const session = await (await fetch('/api/auth/session')).json();
    const out: Record<string, unknown> = {};
    for (const path of paths) {
      const res = await fetch(path, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      const text = await res.text();
      out[path] = { status: res.status, body: text.slice(0, 1400) };
    }
    return out;
  }, PATHS);
  for (const [path, value] of Object.entries(result)) console.log(path, JSON.stringify(value));
  expect(true).toBe(true);
});
