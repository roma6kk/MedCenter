import { bodyObject, expectEqual, expectProblem, expectShape, expectStatus } from './smoke-assert';
import { CLINIC_SHAPE } from './smoke-shapes';
import type { Suite } from './suite';

const GROUP = 'clinic details';
const PATH = '/api/v1/clinic';
const ADMIN_PATH = '/api/v1/admin/clinic';

export async function clinicChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions } = suite;
  await runner.check(GROUP, 'GET /clinic (public, no token) -> name, phone, email, address and hours', async () => {
    const response = await api.get(PATH);
    expectStatus(response, 200);
    expectShape(response.body, CLINIC_SHAPE, 'clinic');
  });
  await runner.check(GROUP, 'PATCH /admin/clinic -> 200 and the public GET shows the change; the old value is put back', async () => {
    const before = String(bodyObject(await api.get(PATH))['hours']);
    const changed = await api.patch(ADMIN_PATH, { session: sessions.admin, body: { hours: 'Smoke 09:00–10:00' } });
    expectStatus(changed, 200);
    expectEqual(bodyObject(await api.get(PATH))['hours'], 'Smoke 09:00–10:00', 'hours after the change');
    expectStatus(await api.patch(ADMIN_PATH, { session: sessions.admin, body: { hours: before } }), 200);
  });
  await runner.check(GROUP, 'PATCH /admin/clinic with a malformed phone or e-mail -> 400 VALIDATION_ERROR', async () => {
    expectProblem(await api.patch(ADMIN_PATH, { session: sessions.admin, body: { phone: '12345' } }), 400, 'VALIDATION_ERROR');
    expectProblem(await api.patch(ADMIN_PATH, { session: sessions.admin, body: { email: 'not-an-email' } }), 400, 'VALIDATION_ERROR');
  });
}
