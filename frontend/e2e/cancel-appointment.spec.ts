/**
 * E2E placeholder — TASK-001 (cancel appointment).
 *
 * SMOKE ONLY: cancelling needs a running stack plus a seeded patient session
 * and an existing booked appointment. Marked skipped until CI wires it.
 */
import { test, expect } from '@playwright/test';

test.fixme('should cancel an appointment with a reason as its owner', async ({ page }) => {
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'Отменить' }).first().click();
  await page.getByLabel('Причина').fill('Пациент заболел');
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByTestId('stamp-cancelled')).toBeVisible();
});

