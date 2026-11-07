import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { bookAnyFreeSlotAs, cancelAppointmentAs } from './fixtures/booking-api';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { isPostTo } from './fixtures/network';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const POLL_TIMEOUT_MS = 100_000;
const BELL = /Уведомления, непрочитанных: (\d+)/;

test.describe('patient notifications', () => {
  test.describe.configure({ mode: 'serial', timeout: 2 * POLL_TIMEOUT_MS });
  let context: BrowserContext;
  let page: Page;

  async function bookAndCancel(): Promise<{ readonly appointmentId: string }> {
    const { id: appointmentId } = await bookAnyFreeSlotAs(page);
    await cancelAppointmentAs(page, appointmentId);
    return { appointmentId };
  }

  function rowOf(appointmentId: string): Locator {
    return page
      .getByRole('group', { name: 'Список уведомлений' })
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/appointments/${appointmentId}"]`), hasText: 'Запись на приём отменена.' });
  }

  async function openUntilArrived(appointmentId: string): Promise<Locator> {
    const row = rowOf(appointmentId);
    await expect(async () => {
      await page.goto('/notifications');
      await expect(row).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: POLL_TIMEOUT_MS, intervals: [2_000, 3_000, 5_000] });
    return row;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'PATIENT', 1));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should raise the unread counter of the bell by polling when a notification arrives while the page stays open', async () => {
    await page.goto('/booking');
    const bell = page.getByRole('button', { name: BELL });
    await expect(bell).toBeVisible();
    const before = Number(BELL.exec((await bell.getAttribute('aria-label')) ?? '')?.[1]);

    await bookAndCancel();

    // No reload: only the 30 s refetch of the unread counter can change the bell.
    await expect
      .poll(async () => Number(BELL.exec((await bell.getAttribute('aria-label')) ?? '')?.[1]), { timeout: POLL_TIMEOUT_MS, intervals: [5_000] })
      .toBeGreaterThan(before);
    await expect(page.getByTestId('unread-badge')).toBeVisible();
  });

  test('should mark one notification read and keep it in the list without the «Новое» marker', async () => {
    const { appointmentId } = await bookAndCancel();
    const row = await openUntilArrived(appointmentId);
    await expect(row.getByText('Новое', { exact: true })).toBeVisible();

    const marked = page.waitForResponse(isPostTo(/\/api\/v1\/notifications\/[^/]+\/read$/));
    await row.getByRole('button', { name: 'Отметить прочитанным' }).click();
    expect((await marked).status()).toBe(204);

    await expect(page.getByText('Уведомление отмечено прочитанным')).toBeVisible();
    await expect(row.getByText('Новое', { exact: true })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Отметить прочитанным' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Непрочитанные' }).click();
    await expect(rowOf(appointmentId)).toHaveCount(0);
  });

  test('should mark every notification read with one action', async () => {
    const { appointmentId } = await bookAndCancel();
    const row = await openUntilArrived(appointmentId);
    await expect(row.getByText('Новое', { exact: true })).toBeVisible();

    const markedAll = page.waitForResponse(isPostTo('/api/v1/notifications/read-all'));
    await page.getByRole('button', { name: 'Отметить все прочитанными' }).click();
    const response = await markedAll;
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { updated: number }).updated).toBeGreaterThanOrEqual(1);

    await expect(page.getByText('Все уведомления отмечены прочитанными')).toBeVisible();
    await expect(row.getByText('Новое', { exact: true })).toHaveCount(0);
  });
});
