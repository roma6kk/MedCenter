/**
 * E2E — scenario A of the frontend design spec §6 (FR-003/004): a guest finds a doctor and a free slot, presses
 * «Записаться», signs in through the real PKCE flow, gets the booking draft back on the confirmation step and confirms.
 *
 * The doctor and the slot are found at run time from the public catalog; the booking is cancelled afterwards.
 */
import { expect, test } from '@playwright/test';
import { continueFromLoginScreen } from './fixtures/auth';
import { cancelAppointmentAs, findFreeSlots, type FreeSlot } from './fixtures/booking-api';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const DEFAULT_ORIGIN = 'http://localhost:3000';

test('should render the public doctor catalog shell when the app is served', async ({ page }) => {
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'Врачи' })).toBeVisible();
});

test('should book an appointment through the login with the draft restored when a guest picks a slot', async ({ page, request, baseURL }) => {
  const [target] = (await findFreeSlots(request, 1)) as [FreeSlot];
  const webOrigin = new URL(baseURL ?? DEFAULT_ORIGIN).origin;

  await test.step('guest opens the doctor from the catalog and picks a free slot', async () => {
    await page.goto('/doctors');
    const card = page.getByTestId('doctor-card').filter({ hasText: target.doctorName });
    await card.getByRole('link', { name: 'Профиль' }).click();
    await expect(page).toHaveURL(/\/doctors\/[^/]+$/);
    await page.getByTestId(`slot-${target.slotId}`).click();
    await expect(page.getByTestId(`slot-${target.slotId}`)).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('«Записаться» sends the guest to the login with returnTo=/booking', async () => {
    await page.getByRole('button', { name: /^Записаться на / }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fbooking$/);
  });

  await test.step('after the sign-in the draft is restored on the confirmation step', async () => {
    await continueFromLoginScreen(page, loadDemoAccount('PATIENT', 2), webOrigin);
    await expect(page).toHaveURL(/\/booking(\?.*)?$/);
    await expect(page.getByText('Черновик записи восстановлен')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Проверьте данные записи' })).toBeVisible();
    await expect(page.getByTestId('booking-summary')).toContainText(target.doctorName);
  });

  const created = await test.step('confirming sends one POST with an Idempotency-Key and gets 201', async () => {
    const posted = page.waitForResponse((response) => response.url().endsWith('/api/v1/appointments') && response.request().method() === 'POST');
    await page.getByTestId('booking-confirm').click();
    const response = await posted;
    expect(response.status()).toBe(201);
    expect(response.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    return (await response.json()) as { id: string; status: string };
  });

  try {
    await expect(page).toHaveURL(new RegExp(`/appointments/${created.id}$`));
    await expect(page.getByTestId('stamp-booked')).toBeVisible();
  } finally {
    await cancelAppointmentAs(page, created.id);
  }
});
