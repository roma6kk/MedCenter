/**
 * E2E placeholder — TASK-001 (booking flow).
 *
 * SMOKE ONLY: without a running stack (Next + 8 BFF + HAPI + Postgres + Redis
 * + RabbitMQ) and a seeded SMART session, only the public catalog shell can be
 * asserted. The authenticated booking flow is marked skipped until the stack
 * is wired into CI — see the frontend review for the follow-up plan.
 */
import { test, expect } from '@playwright/test';

test('should render the public doctor catalog shell when the app is served', async ({ page }) => {
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'Врачи' })).toBeVisible();
});

test.fixme('should book an appointment through login with draft restore', async ({ page }) => {
  await page.goto('/doctors');
  await page.getByRole('link', { name: 'Профиль' }).first().click();
  await page.getByRole('link', { name: 'Записаться' }).click();
  await expect(page.getByTestId('booking-success')).toBeVisible();
});

