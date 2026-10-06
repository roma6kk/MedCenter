/**
 * E2E placeholder — TASK-001 (doctor encounter).
 *
 * SMOKE ONLY: completing an encounter and verifying the read-only replay needs
 * a running stack plus a seeded DOCTOR session and a booked appointment.
 * Marked skipped until CI wires it.
 */
import { test, expect } from '@playwright/test';

test.fixme('should complete an encounter once and render the replay read-only', async ({ page }) => {
  await page.goto('/doctor/appointments');
  await page.getByRole('link', { name: 'Открыть приём' }).first().click();
  await page.getByLabel('Заключение').fill('ОРВИ, состояние удовлетворительное');
  await page.getByRole('button', { name: 'Завершить приём' }).click();
  await expect(page.getByLabel('Заключение')).toBeDisabled();
});

