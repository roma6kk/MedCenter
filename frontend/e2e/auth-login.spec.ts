/**
 * E2E — the token-broker flow in a real browser against the live stack (TASK-001, frontend CORE).
 *
 * authorize → auth-service login form → callback → session → refresh → logout, with the seeded demo users. Skipped when the
 * seed manifest is absent (run `npm run seed:demo -- --users --with-admin` first). Credentials never leave the fixtures.
 *
 * auth-service throttles `POST /oauth/login` per IP and per account (brute-force protection), so every describe signs in
 * ONCE in `beforeAll` and its serial tests share that session; mutating cases (token rotation, sign-out) own a separate account.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { signInThroughLoginForm } from './fixtures/auth';
import { hasDemoManifest, loadDemoAccount, ROLE_LANDING, type DemoRole } from './fixtures/demo-accounts';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const DEFAULT_ORIGIN = 'http://localhost:3000';

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
}

async function openSession(browser: Browser, role: DemoRole, index: number, baseURL: string | undefined, returnTo?: string): Promise<Session> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInThroughLoginForm(page, loadDemoAccount(role, index), { webOrigin: baseURL, returnTo });
  return { context, page };
}

test.describe('anonymous visitor', () => {
  test('should be sent to /login with returnTo when a protected route is opened', async ({ page }) => {
    await page.goto('/appointments');

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fappointments$/);
  });
});

test.describe('patient session', () => {
  test.describe.configure({ mode: 'serial' });
  let session: Session;

  test.beforeAll(async ({ browser, baseURL }) => {
    session = await openSession(browser, 'PATIENT', 0, baseURL);
  });

  test.afterAll(async () => {
    await session.context.close();
  });

  test('should land on its home page on the public origin when it signs in', async ({ baseURL }) => {
    const url = new URL(session.page.url());

    expect(url.origin).toBe(new URL(baseURL ?? DEFAULT_ORIGIN).origin);
    expect(url.pathname).toBe(ROLE_LANDING.PATIENT);
  });

  test('should keep the refresh token out of reach of page scripts when the session is created', async () => {
    const cookies = await session.context.cookies();

    expect(cookies.find((cookie) => cookie.name === 'mc_rt')?.httpOnly).toBe(true);
    expect(await session.page.evaluate(() => document.cookie)).not.toContain('mc_rt');
  });

  test('should still be signed in after several full page reloads', async () => {
    for (let reload = 0; reload < 3; reload += 1) {
      await session.page.reload();
      await session.page.waitForLoadState('load');
      await expect(session.page.getByRole('navigation', { name: 'Пациент' })).toBeVisible();
    }
  });

  test('should show the unread counter in the bell', async () => {
    await expect(session.page.getByRole('link', { name: /Уведомления, непрочитанных: \d+/ })).toBeVisible();
  });

  test('should show the 403 page when an admin route is opened', async () => {
    await session.page.goto('/admin/users');

    await expect(session.page).toHaveURL(/\/403$/);
  });
});

test.describe('patient session with returnTo, rotation and sign-out', () => {
  test.describe.configure({ mode: 'serial' });
  let session: Session;

  test.beforeAll(async ({ browser, baseURL }) => {
    session = await openSession(browser, 'PATIENT', 1, baseURL, '/appointments');
  });

  test.afterAll(async () => {
    await session.context.close();
  });

  test('should return to the page the user asked for after the login when returnTo is set', async () => {
    expect(new URL(session.page.url()).pathname).toBe('/appointments');
  });

  test('should rotate the single-use refresh token and stay signed in when the cached access token is gone', async () => {
    const refreshBefore = (await session.context.cookies()).find((cookie) => cookie.name === 'mc_rt')?.value;

    // The access-token cookie expires after 15 minutes; dropping it forces the next page load through the rotation path.
    await session.context.clearCookies({ name: 'mc_at' });
    await session.page.reload();
    await session.page.waitForLoadState('load');

    await expect(session.page.getByRole('navigation', { name: 'Пациент' })).toBeVisible();
    const refreshAfter = (await session.context.cookies()).find((cookie) => cookie.name === 'mc_rt')?.value;
    expect(refreshAfter).toBeDefined();
    expect(refreshAfter).not.toBe(refreshBefore);
  });

  test('should end the session and protect the routes again when the user signs out', async () => {
    await session.page.getByRole('button', { name: 'Выйти' }).click();
    await expect(session.page).toHaveURL(/\/login$/);

    expect((await session.context.cookies()).map((cookie) => cookie.name)).not.toContain('mc_rt');
    await session.page.goto('/booking');
    await expect(session.page).toHaveURL(/\/login\?returnTo=%2Fbooking$/);
  });
});

for (const role of ['DOCTOR', 'ADMIN'] as const) {
  test.describe(`${role.toLowerCase()} session`, () => {
    test.describe.configure({ mode: 'serial' });
    let session: Session;

    test.beforeAll(async ({ browser, baseURL }) => {
      session = await openSession(browser, role, 0, baseURL);
    });

    test.afterAll(async () => {
      await session.context.close();
    });

    test(`should land a ${role} on its own home page when it signs in`, async () => {
      expect(new URL(session.page.url()).pathname).toBe(ROLE_LANDING[role]);
    });

    test('should show no notification bell because staff have no notification endpoints', async () => {
      await expect(session.page.getByRole('button', { name: 'Выйти' })).toBeVisible();
      await expect(session.page.getByRole('link', { name: /Уведомления/ })).toHaveCount(0);
    });

    test('should show the 403 page when a patient route is opened', async () => {
      await session.page.goto('/booking');

      await expect(session.page).toHaveURL(/\/403$/);
    });
  });
}
