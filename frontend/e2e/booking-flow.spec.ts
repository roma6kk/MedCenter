import { expect, test } from '@playwright/test';
import { fillAuthServiceForm, returnToOfAuthorizeUrl } from './fixtures/auth';
import { cancelAppointmentAs, findFreeSlot, revealSlotOnDoctorPage } from './fixtures/booking-api';
import { isPostTo } from './fixtures/network';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const DEFAULT_ORIGIN = 'http://localhost:3000';

test('should render the public doctor catalog shell when the app is served', async ({ page }) => {
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'Врачи' })).toBeVisible();
});

test('should book an appointment through the login with the draft restored when a guest picks a slot', async ({ page, request, baseURL }) => {
  const target = await findFreeSlot(request);
  const webOrigin = new URL(baseURL ?? DEFAULT_ORIGIN).origin;

  await test.step('guest opens the doctor from the catalog and picks a free slot', async () => {
    await page.goto('/doctors');
    const card = page.getByTestId('doctor-card').filter({ hasText: target.doctorName });
    await card.getByRole('link', { name: /^Профиль/ }).click();
    await expect(page).toHaveURL(/\/doctors\/[^/]+$/);
    await revealSlotOnDoctorPage(page, target);
    await page.getByTestId(`slot-${target.slotId}`).click();
    await expect(page.getByTestId(`slot-${target.slotId}`)).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('«Записаться» sends the guest straight to the auth-service form with returnTo=/booking', async () => {
    await page.getByRole('button', { name: /^Записаться на / }).click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    expect(returnToOfAuthorizeUrl(page.url())).toBe('/booking');
  });

  await test.step('after the sign-in the draft is restored on the confirmation step', async () => {
    await fillAuthServiceForm(page, loadDemoAccount('PATIENT', 2), webOrigin);
    await expect(page).toHaveURL(/\/booking(\?.*)?$/);
    await expect(page.getByText('Черновик записи восстановлен')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Проверьте данные записи' })).toBeVisible();
    await expect(page.getByTestId('booking-summary')).toContainText(target.doctorName);
  });

  const created = await test.step('confirming sends one POST with an Idempotency-Key and gets 201', async () => {
    const posted = page.waitForResponse(isPostTo('/api/v1/appointments'));
    await page.getByTestId('booking-confirm').click();
    const response = await posted;
    expect(response.status()).toBe(201);
    expect(response.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    return (await response.json()) as { id: string; status: string };
  });

  try {
    await expect(page.getByRole('heading', { name: 'Вы записаны на приём' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText(target.doctorName);
    await expect(page.getByRole('link', { name: 'Отменить запись' })).toHaveAttribute('href', `/appointments/${created.id}`);
    await page.goto(`/appointments/${created.id}`);
    await expect(page.getByTestId('stamp-booked')).toBeVisible();
  } finally {
    await cancelAppointmentAs(page, created.id);
  }
});
