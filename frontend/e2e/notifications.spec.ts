/**
 * E2E — scenario E of the frontend design spec §6 (FR-008, API 8.1–8.4): the bell polls the unread counter, one
 * notification is marked read, then all of them.
 *
 * Notifications are produced at run time: a booking that is cancelled right away (the slot is free again, so the data
 * cleans itself) makes the notification service write an in-app notification asynchronously (RabbitMQ). Other specs
 * create notifications for the same demo patients, so nothing here asserts absolute counts: every check follows the
 * notification of this run, found by the unique cancellation reason.
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { bookSlotAs, cancelAppointmentAs, findFreeSlots } from './fixtures/booking-api';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

/** The unread counter is polled every 30 s (ADR-015) and the notification arrives through the broker: allow both. */
const POLL_TIMEOUT_MS = 100_000;
const BELL = /Уведомления, непрочитанных: (\d+)/;

test.describe('patient notifications', () => {
  test.describe.configure({ mode: 'serial', timeout: 2 * POLL_TIMEOUT_MS });
  let context: BrowserContext;
  let page: Page;

  /** Books a free slot and cancels it with a unique reason; resolves with the appointment id and that reason. */
  async function bookAndCancel(): Promise<{ readonly appointmentId: string; readonly reason: string }> {
    const [target] = await findFreeSlots(page.request, 1);
    if (target === undefined) throw new Error('no free slot');
    const booked = await bookSlotAs(page, target.slotId);
    expect(booked.status, 'the patient books the slot').toBe(201);
    const appointmentId = String(booked.body['id']);
    const reason = `E2E уведомления ${randomUUID().slice(0, 8)}`;
    await cancelAppointmentAs(page, appointmentId, reason);
    return { appointmentId, reason };
  }

  function rowOf(appointmentId: string, reason: string): Locator {
    return page
      .getByRole('group', { name: 'Список уведомлений' })
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/appointments/${appointmentId}"]`), hasText: reason });
  }

  /** Re-reads the list until the notification of the cancellation has arrived. */
  async function openUntilArrived(appointmentId: string, reason: string): Promise<Locator> {
    const row = rowOf(appointmentId, reason);
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
    const bell = page.getByRole('link', { name: BELL });
    await expect(bell).toBeVisible();
    const before = Number(BELL.exec((await bell.getAttribute('aria-label')) ?? '')?.[1]);

    await bookAndCancel();

    // No reload and no navigation: only the 30 s refetch of `GET /api/v1/notifications/unread-count` can change the bell.
    await expect
      .poll(async () => Number(BELL.exec((await bell.getAttribute('aria-label')) ?? '')?.[1]), { timeout: POLL_TIMEOUT_MS, intervals: [5_000] })
      .toBeGreaterThan(before);
    await expect(page.getByTestId('unread-badge')).toBeVisible();
  });

  test('should mark one notification read and keep it in the list without the «Новое» marker', async () => {
    const { appointmentId, reason } = await bookAndCancel();
    const row = await openUntilArrived(appointmentId, reason);
    await expect(row.getByText('Новое', { exact: true })).toBeVisible();

    const marked = page.waitForResponse((response) => /\/api\/v1\/notifications\/[^/]+\/read$/.test(response.url()) && response.request().method() === 'POST');
    await row.getByRole('button', { name: 'Отметить прочитанным' }).click();
    expect((await marked).status()).toBe(204);

    await expect(page.getByText('Уведомление отмечено прочитанным')).toBeVisible();
    await expect(row.getByText('Новое', { exact: true })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Отметить прочитанным' })).toHaveCount(0);
    // The unread filter (API 8.1 `unread=true`) no longer lists it.
    await page.getByRole('tab', { name: 'Непрочитанные' }).click();
    await expect(rowOf(appointmentId, reason)).toHaveCount(0);
  });

  test('should mark every notification read with one action', async () => {
    const { appointmentId, reason } = await bookAndCancel();
    const row = await openUntilArrived(appointmentId, reason);
    await expect(row.getByText('Новое', { exact: true })).toBeVisible();

    const markedAll = page.waitForResponse((response) => response.url().endsWith('/api/v1/notifications/read-all') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Отметить все прочитанными' }).click();
    const response = await markedAll;
    expect(response.status()).toBe(200);
    expect(((await response.json()) as { updated: number }).updated).toBeGreaterThanOrEqual(1);

    await expect(page.getByText('Все уведомления отмечены прочитанными')).toBeVisible();
    await expect(row.getByText('Новое', { exact: true })).toHaveCount(0);
  });
});
