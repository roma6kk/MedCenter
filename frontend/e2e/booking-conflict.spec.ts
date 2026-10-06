/**
 * E2E placeholder — TASK-001 (SLOT_CONFLICT).
 *
 * SMOKE ONLY: the 409 recovery path needs a running stack plus a seeded
 * session and a concurrently-booked slot. Marked skipped until CI wires it.
 */
import { test, expect } from '@playwright/test';

test.fixme('should surface the SLOT_CONFLICT toast and refetch slots on a 409', async ({ page }) => {
  await page.goto('/booking');
  await expect(page.getByTestId('slot-conflict-toast')).toBeVisible();
  await expect(page.getByTestId('slot-conflict-toast')).toHaveAttribute('aria-live', 'assertive');
});

