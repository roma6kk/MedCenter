/**
 * E2E — security checks of the frontend design spec §6 and ADR-013 (patient compartment), against the live stack:
 *
 * - the UI never sends a `patient` query parameter while a patient reads through the `patient/*` scopes (`/me/*` family);
 * - the compartment holds at the API too: a patient token cannot read the chart of another patient;
 * - role guards: a patient has no way into the doctor and admin routes, a doctor none into the admin and patient ones;
 * - an anonymous visitor is sent to `/login?returnTo=<path+query>` from every protected route, never from a public one.
 *
 * Role gating in the UI is UX only (the BFF guards are the authority, ADR-009), so the guards are asserted on the visible
 * 403 page AND on the API answer where a route has one. The sessions are the saved states of `auth.setup.ts`.
 */
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { accessTokenOf } from './fixtures/booking-api';
import { hasDemoManifest, type DemoRole } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const PATIENT_ROUTES: ReadonlyArray<string> = ['/booking', '/appointments', '/history', '/prescriptions', '/profile', '/notifications'];
const FORBIDDEN_TEXT = 'Этот раздел недоступен для вашей роли.';

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
}

async function expectForbidden(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByText(FORBIDDEN_TEXT)).toBeVisible();
}

test.describe('patient compartment (ADR-013)', () => {
  test.describe.configure({ mode: 'serial' });
  let patient: Session;
  let other: Session;

  test.beforeAll(async ({ browser, baseURL }) => {
    patient = await openStoredSession(browser, baseURL, 'PATIENT', 0);
    other = await openStoredSession(browser, baseURL, 'PATIENT', 1);
  });

  test.afterAll(async () => {
    await patient.context.close();
    await other.context.close();
  });

  test('should never send a patient query parameter while a patient opens its own pages', async () => {
    const sent: Request[] = [];
    patient.page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) sent.push(request);
    });

    for (const route of PATIENT_ROUTES) {
      await patient.page.goto(route);
      await patient.page.waitForLoadState('networkidle');
      await expect(patient.page.getByRole('navigation', { name: 'Пациент' })).toBeVisible();
    }

    expect(sent.length, 'the patient pages read the API').toBeGreaterThan(0);
    const withPatient = sent.filter((request) => new URL(request.url()).searchParams.has('patient')).map((request) => new URL(request.url()).pathname);
    expect(withPatient, 'requests that carry a `patient` parameter').toEqual([]);
    // The reads of the patient go through the `/me/*` family (API §3.1, §7.6, §7.7), never through `/patients/{id}`.
    const chartReads = sent.filter((request) => /^\/api\/v1\/patients\//.test(new URL(request.url()).pathname)).map((request) => new URL(request.url()).pathname);
    expect(chartReads, 'reads of a chart by id from a patient page').toEqual([]);
  });

  test('should answer 403 COMPARTMENT_VIOLATION when a patient token asks for the history of another patient', async () => {
    const session = (await (await other.page.request.get('/api/auth/session')).json()) as { patientRef: string | null };
    const otherId = session.patientRef?.split('/').pop();
    expect(otherId, 'the second patient has a Patient reference').toBeTruthy();
    const token = await accessTokenOf(patient.page);

    const history = await patient.page.request.get(`/api/v1/patients/${encodeURIComponent(String(otherId))}/history`, { headers: { Authorization: `Bearer ${token}` } });

    expect(history.status()).toBe(403);
    expect(((await history.json()) as { errorCode?: string }).errorCode).toBe('COMPARTMENT_VIOLATION');
  });

  test('should show the 403 page instead of the chart route of another patient', async () => {
    await expectForbidden(patient.page, '/patients/some-other-patient');
  });
});

test.describe('role guards', () => {
  const FORBIDDEN: ReadonlyArray<{ readonly role: DemoRole; readonly routes: ReadonlyArray<string> }> = [
    { role: 'PATIENT', routes: ['/doctor/appointments', '/doctor/schedule', '/encounters/1', '/admin/analytics', '/admin/users', '/admin/audit'] },
    { role: 'DOCTOR', routes: ['/admin/analytics', '/admin/rooms', '/admin/audit', '/booking', '/history'] },
  ];

  for (const { role, routes } of FORBIDDEN) {
    test(`should show the 403 page to a ${role.toLowerCase()} on every route of another role`, async ({ browser, baseURL }) => {
      const session = await openStoredSession(browser, baseURL, role, 0);
      try {
        for (const route of routes) await expectForbidden(session.page, route);
      } finally {
        await session.context.close();
      }
    });
  }

  test('should refuse the admin API to a patient and to a doctor', async ({ browser, baseURL }) => {
    for (const role of ['PATIENT', 'DOCTOR'] as const) {
      const session = await openStoredSession(browser, baseURL, role, 0);
      try {
        const token = await accessTokenOf(session.page);
        const audit = await session.page.request.get('/api/v1/admin/audit', { headers: { Authorization: `Bearer ${token}` } });
        expect(audit.status(), `${role} on GET /api/v1/admin/audit`).toBe(403);
      } finally {
        await session.context.close();
      }
    }
  });

  test('should keep an administrator out of the patient and doctor routes', async ({ browser, baseURL }) => {
    const session = await openStoredSession(browser, baseURL, 'ADMIN', 0);
    try {
      for (const route of ['/booking', '/doctor/appointments']) await expectForbidden(session.page, route);
    } finally {
      await session.context.close();
    }
  });
});

test.describe('anonymous visitor', () => {
  const PROTECTED: ReadonlyArray<string> = ['/booking', '/appointments', '/history?page=2', '/profile', '/notifications', '/doctor/appointments', '/doctor/schedule', '/admin/analytics', '/admin/audit?entity=Location'];

  for (const route of PROTECTED) {
    test(`should be sent to the login with returnTo=${route} when the protected route is opened`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=${encodeURIComponent(route).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible();
    });
  }

  test('should read the public pages without a login', async ({ page }) => {
    await page.goto('/doctors');

    await expect(page).toHaveURL(/\/doctors$/);
    await expect(page.getByRole('heading', { name: 'Врачи' })).toBeVisible();
  });

  test('should refuse the API without a token', async ({ request }) => {
    const response = await request.get('/api/v1/appointments');

    expect(response.status()).toBe(401);
  });
});
