import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const NEW_PHONE = '+375 17 333-44-55';

test.describe('admin changes the clinic phone', () => {
  let context: BrowserContext;
  let page: Page;
  let originalPhone: string;

  async function savePhone(phone: string): Promise<void> {
    await page.goto('/admin/settings');
    await page.getByLabel('Телефон регистратуры').fill(phone);
    await page.getByRole('button', { name: 'Сохранить' }).click();
  }

  // GET /api/v1/clinic is served with max-age=60, so the landing is read in a fresh context with an empty HTTP cache.
  async function phoneOnLanding(browser: Browser, baseURL: string | undefined): Promise<string> {
    const visitor = await browser.newContext({ baseURL });
    try {
      const landing = await visitor.newPage();
      const clinic = landing.waitForResponse((response) => response.url().endsWith('/api/v1/clinic'));
      await landing.goto('/');
      await clinic;
      return (await landing.locator('a[href^="tel:"]').first().textContent()) ?? '';
    } finally {
      await visitor.close();
    }
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
    await page.goto('/admin/settings');
    originalPhone = await page.getByLabel('Телефон регистратуры').inputValue();
  });

  test.afterEach(async () => {
    await savePhone(originalPhone);
    await expect(page.getByText('Сведения о клинике сохранены')).toBeVisible();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should show the new phone on the public landing after the admin saves it', async ({ browser, baseURL }) => {
    await savePhone(NEW_PHONE);
    await expect(page.getByText('Сведения о клинике сохранены')).toBeVisible();

    await expect.poll(() => phoneOnLanding(browser, baseURL), { timeout: 30_000 }).toBe(NEW_PHONE);
  });
});
