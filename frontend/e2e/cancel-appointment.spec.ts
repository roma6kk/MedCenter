/**
 * E2E — scenario B of the frontend design spec §6 (FR-005/006, BR-002): the patient cancels an appointment with a reason,
 * the status becomes «cancelled» (StampBadge) and a notification about it shows up in the notification center.
 *
 * The appointment is created through the API at run time on a free slot (the cancelled slot is free again, so the data
 * cleans itself); the patient signs in once per run.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { bookSlotAs, cancelAppointmentAs, findFreeSlots } from './fixtures/booking-api';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const CANCEL_REASON = 'Пациент заболел';
const NOTIFICATION_TIMEOUT_MS = 90_000;

test.describe('patient cancels an appointment', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;
  let appointmentId: string;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'PATIENT', 0));
    const [target] = await findFreeSlots(page.request, 1);
    if (target === undefined) throw new Error('no free slot');
    const booked = await bookSlotAs(page, target.slotId);
    expect(booked.status).toBe(201);
    appointmentId = String(booked.body['id']);
  });

  test.afterAll(async () => {
    // Idempotent: a no-op when the test already cancelled it.
    await cancelAppointmentAs(page, appointmentId);
    await context.close();
  });

  test('should mark the appointment cancelled when the owner gives a reason', async () => {
    await page.goto(`/appointments/${appointmentId}`);
    await expect(page.getByTestId('stamp-booked')).toBeVisible();

    await page.getByRole('button', { name: /^Отменить запись/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Отмена записи' });
    await dialog.getByLabel('Причина отмены').fill(CANCEL_REASON);
    const cancelled = page.waitForResponse((response) => response.url().endsWith(`/api/v1/appointments/${appointmentId}/cancel`) && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Подтвердить отмену' }).click();
    expect((await cancelled).ok()).toBe(true);

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('stamp-cancelled')).toBeVisible();
    await expect(page.getByTestId('stamp-booked')).toHaveCount(0);
    await expect(page.getByText(CANCEL_REASON)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Отменить запись/ })).toHaveCount(0);
  });

  test('should show a notification about the cancellation in the notification center', async () => {
    // The notification text carries no reason (owner decision). It is produced asynchronously (RabbitMQ → notification-service), so the list is re-read until it arrives.
    const row = page
      .getByRole('group', { name: 'Список уведомлений' })
      .getByRole('listitem')
      .filter({ has: page.locator(`a[href="/appointments/${appointmentId}"]`), hasText: 'Запись на приём отменена.' });
    await expect(async () => {
      await page.goto('/notifications');
      await expect(row).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: NOTIFICATION_TIMEOUT_MS, intervals: [2_000, 3_000, 5_000] });
  });
});
