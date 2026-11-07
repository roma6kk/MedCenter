import { expect, test, type Page } from '@playwright/test';
import { bookSlotAs, cancelAppointmentAs, findFreeSlot, revealSlotOnDoctorPage } from './fixtures/booking-api';
import { isPostTo } from './fixtures/network';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession, type StoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

test.describe('two patients, one slot', () => {
  test.describe.configure({ mode: 'serial' });
  let first: StoredSession;
  let second: StoredSession;
  const booked: Array<{ readonly owner: Page; readonly id: string }> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    first = await openStoredSession(browser, baseURL, 'PATIENT', 1);
    second = await openStoredSession(browser, baseURL, 'PATIENT', 2);
  });

  test.afterAll(async () => {
    for (const { owner, id } of booked) await cancelAppointmentAs(owner, id);
    await first.context.close();
    await second.context.close();
  });

  test('should let exactly one of two parallel bookings win and answer the other 409 SLOT_CONFLICT', async ({ request }) => {
    const target = await findFreeSlot(request);

    const [a, b] = await Promise.all([bookSlotAs(first.page, target.slotId), bookSlotAs(second.page, target.slotId)]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? { owner: first.page, result: a } : { owner: second.page, result: b };
    const loser = a.status === 201 ? b : a;
    booked.push({ owner: winner.owner, id: String(winner.result.body['id']) });
    expect(loser.body['errorCode']).toBe('SLOT_CONFLICT');
  });

  test('should show the conflict notice and the refused slot as taken when the slot is lost before the confirmation', async ({ request }) => {
    const target = await findFreeSlot(request);
    const page = first.page;

    await page.goto(`/doctors/${encodeURIComponent(target.doctorId)}`);
    await revealSlotOnDoctorPage(page, target);
    await page.getByTestId(`slot-${target.slotId}`).click();
    await page.getByRole('button', { name: /^Записаться на / }).click();
    await expect(page.getByRole('heading', { name: 'Проверьте данные записи' })).toBeVisible();

    const rival = await bookSlotAs(second.page, target.slotId);
    expect(rival.status).toBe(201);
    booked.push({ owner: second.page, id: String(rival.body['id']) });

    const refused = page.waitForResponse(isPostTo('/api/v1/appointments'));
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
