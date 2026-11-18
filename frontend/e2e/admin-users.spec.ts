import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { isPostTo } from './fixtures/network';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const PASSWORD = 'E2e-Doctor-Pass-1!';
// Letters only: the name is also the unique search term of the public catalog.
const TAG = Date.now().toString(36).replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)] as string);
const LAST_NAME = `Etoe${TAG}`;
const EMAIL = `e2e.doctor.${Date.now()}@medcenter.test`;

test.describe('admin creates a doctor account', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;

  // The public catalog is cached for 5 minutes per URL, so every look at it uses its own search term in a fresh context.
  async function catalogCards(browser: Browser, baseURL: string | undefined, search: string): Promise<number> {
    const visitor = await browser.newContext({ baseURL });
    try {
      const catalog = await visitor.newPage();
      await catalog.goto(`/doctors?search=${search}`);
      await catalog.waitForLoadState('networkidle');
      return await catalog.getByRole('heading', { name: new RegExp(LAST_NAME) }).count();
    } finally {
      await visitor.close();
    }
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should list the new doctor and show it in the public catalog', async ({ browser, baseURL }) => {
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый пользователь' });
    await dialog.getByLabel('Фамилия').fill(LAST_NAME);
    await dialog.getByLabel(/^Имя/).fill('Автотест');
    await dialog.getByLabel('Email').fill(EMAIL);
    await dialog.getByLabel('Пароль').fill(PASSWORD);
    await dialog.getByRole('checkbox', { name: 'Пациент' }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Врач' }).check();
    const specialty = dialog.getByLabel('Специальность');
    const firstSpecialty = specialty.locator('option:not([value=""])').first();
    await expect(firstSpecialty).toBeAttached();
    await specialty.selectOption((await firstSpecialty.getAttribute('value')) as string);
    const created = page.waitForResponse(isPostTo('/api/v1/admin/users'));
    await dialog.getByRole('button', { name: 'Создать пользователя' }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toBeHidden();

    await page.getByRole('searchbox', { name: 'Поиск' }).fill(EMAIL);
    const row = page.getByRole('row').filter({ hasText: EMAIL });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Активен');

    expect(await catalogCards(browser, baseURL, LAST_NAME)).toBeGreaterThan(0);
  });

  test('should remove the deactivated doctor from the public catalog', async ({ browser, baseURL }) => {
    await page.goto(`/admin/users?search=${encodeURIComponent(EMAIL)}`);
    const row = page.getByRole('row').filter({ hasText: EMAIL });
    await row.getByRole('button', { name: /^Действия/ }).click();
    await page.getByRole('menuitem', { name: 'Деактивировать' }).click();
    await page.getByRole('dialog', { name: 'Деактивация учётной записи' }).getByRole('button', { name: 'Деактивировать' }).click();
    await expect(row).toContainText('Деактивирован');

    expect(await catalogCards(browser, baseURL, LAST_NAME.slice(0, -1))).toBe(0);
  });
});
