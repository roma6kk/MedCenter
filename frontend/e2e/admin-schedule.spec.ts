/**
 * E2E placeholder — TASK-001 (admin schedule).
 *
 * SMOKE ONLY: creating a schedule and generating slots needs a running stack
 * plus an ADMIN session. Marked skipped until CI wires it.
 */
import { test, expect } from '@playwright/test';

test.fixme('should create a schedule and generate slots as an admin', async ({ page }) => {
  await page.goto('/admin/schedules');
  await page.getByRole('button', { name: 'Сгенерировать слоты' }).click();
  await expect(page.getByTestId('generation-result')).toBeVisible();
});

