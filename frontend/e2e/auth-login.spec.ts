import { expect, test } from '@playwright/test';
import { openSignedInSession, returnToOfAuthorizeUrl } from './fixtures/auth';
import { hasDemoManifest, ROLE_LANDING } from './fixtures/demo-accounts';
import type { StoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const DEFAULT_ORIGIN = 'http://localhost:3000';

test.describe('anonymous visitor', () => {
  test('should be sent to /login with returnTo, and from there straight to the auth-service form, when a protected route is opened', async ({ page, request }) => {
    const redirect = await request.get('/appointments', { maxRedirects: 0 });
    expect(redirect.headers()['location']).toMatch(/\/login\?returnTo=%2Fappointments$/);

    await page.goto('/appointments');

    await expect(page.locator('input[name="email"]')).toBeVisible();
    expect(returnToOfAuthorizeUrl(page.url())).toBe('/appointments');
  });

  test('should show the branded auth-service form with a way back to the site and a password toggle', async ({ page, baseURL }) => {
    await page.goto('/login');

    await expect(page.getByRole('link', { name: /На сайт/ })).toHaveAttribute('href', `${new URL(baseURL ?? DEFAULT_ORIGIN).origin}/`);
    const password = page.locator('input[name="password"]');
    await expect(password).toHaveAttribute('type', 'password');
    const toggle = page.getByRole('button', { name: 'Показать пароль' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('patient session', () => {
  test.describe.configure({ mode: 'serial' });
  let session: StoredSession;

  test.beforeAll(async ({ browser, baseURL }) => {
    session = await openSignedInSession(browser, 'PATIENT', 0, baseURL);
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
    await expect(session.page.getByRole('button', { name: /Уведомления, непрочитанных: \d+/ })).toBeVisible();
  });

  test('should show the 403 page when an admin route is opened', async () => {
    await session.page.goto('/admin/users');

    await expect(session.page).toHaveURL(/\/403$/);
  });
});

test.describe('patient session with returnTo, rotation and sign-out', () => {
  test.describe.configure({ mode: 'serial' });
  let session: StoredSession;

  test.beforeAll(async ({ browser, baseURL }) => {
    session = await openSignedInSession(browser, 'PATIENT', 1, baseURL, '/appointments');
  });

  test.afterAll(async () => {
    await session.context.close();
  });

  test('should return to the page the user asked for after the login when returnTo is set', async () => {
    expect(new URL(session.page.url()).pathname).toBe('/appointments');
  });

  test('should rotate the single-use refresh token and stay signed in when the cached access token is gone', async () => {
    const refreshBefore = (await session.context.cookies()).find((cookie) => cookie.name === 'mc_rt')?.value;

    // The access-token cookie expires after 15 minutes; dropping it forces the rotation path.
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
    await expect(session.page).toHaveURL(/\/$/);

    expect((await session.context.cookies()).map((cookie) => cookie.name)).not.toContain('mc_rt');
    await session.page.goto('/booking');
    await expect(session.page.locator('input[name="email"]')).toBeVisible();
    expect(returnToOfAuthorizeUrl(session.page.url())).toBe('/booking');
  });
});

for (const role of ['DOCTOR', 'ADMIN'] as const) {
  test.describe(`${role.toLowerCase()} session`, () => {
    test.describe.configure({ mode: 'serial' });
    let session: StoredSession;

    test.beforeAll(async ({ browser, baseURL }) => {
      session = await openSignedInSession(browser, role, 0, baseURL);
    });

    test.afterAll(async () => {
      await session.context.close();
    });

    test(`should land a ${role} on its own home page when it signs in`, async () => {
      expect(new URL(session.page.url()).pathname).toBe(ROLE_LANDING[role]);
    });

    test('should show no notification bell because staff have no notification endpoints', async () => {
      const profileMenu = session.page.getByRole('button', { name: /^Меню профиля: / }).first();
      await profileMenu.click();
      await expect(session.page.getByRole('menuitem', { name: 'Выйти' })).toBeVisible();
      await session.page.keyboard.press('Escape');
      await expect(session.page.getByRole('button', { name: /Уведомления/ })).toHaveCount(0);
    });

    test('should show the 403 page when a patient route is opened', async () => {
      await session.page.goto('/booking');

      await expect(session.page).toHaveURL(/\/403$/);
    });
  });
}
