/**
 * E2E placeholder — TASK-001 (patient compartment, ADR-013).
 *
 * SMOKE ONLY: the invariant asserted here is "the client never sends a
 * `patient=` query parameter". Without a seeded session the route redirects to
 * `/login`, so the check currently passes vacuously; the full compartment
 * scenario is marked skipped until CI wires the stack.
 */
import { test, expect } from '@playwright/test';

test('should never send a patient query parameter from the client', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/v1/')) sent.push(url);
  });
  await page.goto('/appointments');
  expect(sent.every((url) => !url.includes('patient='))).toBe(true);
});

test.fixme('should hide another patient chart as 404 for a patient-scoped token', async ({ page }) => {
  await page.goto('/patients/some-other-patient');
  await expect(page.getByTestId('not-found-state')).toBeVisible();
});

