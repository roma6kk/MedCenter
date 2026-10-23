/**
 * E2E — scenario A2 of the frontend design spec §6 (BR-001): two patients go for one slot at the same time, one wins,
 * the other gets 409 SLOT_CONFLICT and the wizard puts them back on the slot step with the refused slot shown as taken.
 *
 * Two seeded patients open their saved sessions (`auth.setup.ts`; the login is rate limited); the slots are found at run time and every
 * booking that was made is cancelled afterwards.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { bookSlotAs, cancelAppointmentAs, findFreeSlots } from './fixtures/booking-api';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
}

async function openPatient(browser: Browser, index: number, baseURL: string | undefined): Promise<Session> {
  return openStoredSession(browser, baseURL, 'PATIENT', index);
}

test.describe('two patients, one slot', () => {
  test.describe.configure({ mode: 'serial' });
  let first: Session;
  let second: Session;
  const booked: Array<{ readonly owner: Page; readonly id: string }> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    first = await openPatient(browser, 1, baseURL);
    second = await openPatient(browser, 2, baseURL);
  });

  test.afterAll(async () => {
    for (const { owner, id } of booked) await cancelAppointmentAs(owner, id);
    await first.context.close();
    await second.context.close();
  });

  test('should let exactly one of two parallel bookings win and answer the other 409 SLOT_CONFLICT', async ({ request }) => {
    const [target] = await findFreeSlots(request, 1);
    if (target === undefined) throw new Error('no free slot');

    const [a, b] = await Promise.all([bookSlotAs(first.page, target.slotId), bookSlotAs(second.page, target.slotId)]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? { owner: first.page, result: a } : { owner: second.page, result: b };
    const loser = a.status === 201 ? b : a;
    booked.push({ owner: winner.owner, id: String(winner.result.body['id']) });
    expect(loser.body['errorCode']).toBe('SLOT_CONFLICT');
  });

  test('should show the conflict notice and the refused slot as taken when the slot is lost before the confirmation', async ({ request }) => {
    const [target] = await findFreeSlots(request, 1);
    if (target === undefined) throw new Error('no free slot');
    const page = first.page;

    await page.goto(`/doctors/${encodeURIComponent(target.doctorId)}`);
    await page.getByTestId(`slot-${target.slotId}`).click();
    await page.getByRole('button', { name: /^Записаться на / }).click();
    await expect(page.getByRole('heading', { name: 'Проверьте данные записи' })).toBeVisible();

    // The other patient takes the slot while this one is still reading the confirmation.
    const rival = await bookSlotAs(second.page, target.slotId);
    expect(rival.status).toBe(201);
    booked.push({ owner: second.page, id: String(rival.body['id']) });

    const refused = page.waitForResponse((response) => response.url().endsWith('/api/v1/appointments') && response.request().method() === 'POST');
    const refetched = page.waitForResponse((response) => /\/api\/v1\/doctors\/[^/]+\/slots\?/.test(response.url()) && response.request().method() === 'GET');
    await page.getByTestId('booking-confirm').click();
    expect((await refused).status()).toBe(409);
    expect((await refetched).ok()).toBe(true);

    const notice = page.getByTestId('slot-conflict-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toContainText('Это время только что заняли');
    await expect(page.getByRole('heading', { name: 'Выберите время' })).toBeVisible();
    const tile = page.getByTestId(`slot-${target.slotId}`);
    await expect(tile).toHaveAttribute('data-state', 'taken');
    await expect(tile).toContainText('только что занято');
    await expect(tile).not.toHaveAttribute('aria-pressed', 'true');
  });
});
