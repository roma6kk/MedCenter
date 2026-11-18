import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInThroughLoginForm } from './fixtures/auth';
import { authHeaders } from './fixtures/booking-api';
import { DemoAccount, hasDemoManifest, ROLE_LANDING } from './fixtures/demo-accounts';
import { isPostTo } from './fixtures/network';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const STAMP = Date.now();
const EMAIL = `e2e.password.${STAMP}@medcenter.test`;
const RESET_PASSWORD = 'E2e-Reset-Pass-2!';
const OWN_PASSWORD = 'E2e-Own-Pass-3!';

test.describe('admin resets a password and the user changes it again', () => {
  test.describe.configure({ mode: 'serial' });
  let adminContext: BrowserContext;
  let adminPage: Page;
  let userId: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context: adminContext, page: adminPage } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
    const created = await adminPage.request.post('/api/v1/admin/users', {
      headers: await authHeaders(adminPage),
      data: { email: EMAIL, firstName: 'Автотест', lastName: 'Пароль', password: 'E2e-First-Pass-1!', roles: ['ADMIN'] },
    });
    expect(created.status(), 'the throw-away admin account is created').toBe(201);
    userId = ((await created.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    await adminPage.request.patch(`/api/v1/admin/users/${userId}`, { headers: await authHeaders(adminPage), data: { isActive: false } });
    await adminContext.close();
  });

  test('should sign in with the reset password, sign out after the change and sign in with the newest one', async ({ browser, baseURL }) => {
    await adminPage.goto(`/admin/users?search=${encodeURIComponent(EMAIL)}`);
    await adminPage.getByRole('row').filter({ hasText: EMAIL }).getByRole('button', { name: /^Действия/ }).click();
    await adminPage.getByRole('menuitem', { name: 'Изменить' }).click();
    const editDialog = adminPage.getByRole('dialog', { name: 'Редактирование пользователя' });
    await editDialog.getByLabel('Новый пароль').fill(RESET_PASSWORD);
    const saved = adminPage.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/users/${userId}`) && response.request().method() === 'PATCH');
    await editDialog.getByRole('button', { name: 'Сохранить' }).click();
    expect((await saved).ok()).toBe(true);
    await expect(editDialog).toBeHidden();

    const userContext = await browser.newContext({ baseURL });
    try {
      const page = await userContext.newPage();
      await signInThroughLoginForm(page, new DemoAccount('ADMIN', EMAIL, RESET_PASSWORD), { webOrigin: baseURL });
      await expect(page).toHaveURL(new RegExp(`${ROLE_LANDING.ADMIN}$`));

      await page.getByRole('button', { name: /^Меню профиля/ }).first().click();
      await page.getByRole('menuitem', { name: 'Сменить пароль' }).click();
      const dialog = page.getByRole('dialog', { name: 'Смена пароля' });
      await dialog.getByLabel('Текущий пароль').fill(RESET_PASSWORD);
      await dialog.getByLabel('Новый пароль').fill(OWN_PASSWORD);
      const changed = page.waitForResponse(isPostTo('/api/v1/me/password'));
      await dialog.getByRole('button', { name: 'Сменить пароль' }).click();
      expect((await changed).ok()).toBe(true);
      await expect(page).toHaveURL(/\/login/);

      await signInThroughLoginForm(page, new DemoAccount('ADMIN', EMAIL, OWN_PASSWORD), { webOrigin: baseURL });
      await expect(page).toHaveURL(new RegExp(`${ROLE_LANDING.ADMIN}$`));
    } finally {
      await userContext.close();
    }
  });
});
