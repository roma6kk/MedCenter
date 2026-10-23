/**
 * E2E — scenario F of the frontend design spec §6 (FR-019, FR-021, API 9.1–9.4): the administrator reads the analytics
 * report of a period and finds an audit event with the journal filters.
 *
 * The audit events are made at run time: the test creates a room and deletes it through the API (both write an
 * AuditEvent of resource `Location/<id>`, asynchronously), then finds them by resource, actor and period. Nothing here
 * asserts absolute counts of other data: the report is compared with what the API itself answered for the same period.
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page, type Response } from '@playwright/test';
import { accessTokenOf, bookAnyFreeSlotAs, cancelAppointmentAs } from './fixtures/booking-api';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const AUDIT_WRITE_TIMEOUT_MS = 60_000;
const NO_DATA = 'Нет данных за выбранный период';

interface AppointmentsReport {
  readonly total: number;
  readonly booked: number;
  readonly fulfilled: number;
  readonly cancelled: number;
  readonly noshow: number;
}

const isReport = (kind: string) => (response: Response): boolean => new URL(response.url()).pathname === `/api/v1/admin/analytics/${kind}` && response.request().method() === 'GET';
const isAudit = (response: Response): boolean => new URL(response.url()).pathname === '/api/v1/admin/audit' && response.request().method() === 'GET';

/** The `sub` of the page's access token: the `userId` the journal records for the account. */
async function subjectOf(page: Page): Promise<string> {
  const payload = (await accessTokenOf(page)).split('.')[1] ?? '';
  return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }).sub;
}

test.describe('admin analytics', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should render the appointments report of the period with the numbers the API answered', async () => {
    const appointments = page.waitForResponse(isReport('appointments'));
    const encounters = page.waitForResponse(isReport('encounters'));
    const services = page.waitForResponse(isReport('services-popularity'));
    await page.goto('/admin/analytics');
    const report = (await (await appointments).json()) as AppointmentsReport;
    expect((await encounters).ok()).toBe(true);
    expect((await services).ok()).toBe(true);
    expect(report.total, 'the demo stack holds appointments of the current year').toBeGreaterThan(0);

    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Аналитика');
    const kpis = page.getByTestId('kpi');
    await expect(kpis).toHaveCount(5);
    await expect(kpis.nth(0)).toContainText(String(report.total));
    await expect(kpis.nth(1)).toContainText(String(report.booked));
    await expect(kpis.nth(2)).toContainText('Посещено');
    await expect(kpis.nth(2)).toContainText(String(report.fulfilled));
    await expect(kpis.nth(3)).toContainText(String(report.cancelled));
    await expect(kpis.nth(4)).toContainText(String(report.noshow));
    await expect(page.getByRole('table', { name: 'Завершённые приёмы по специальностям' })).toBeVisible();
    await expect(page.getByRole('table', { name: /^Топ-\d+ услуг по записям$/ })).toBeVisible();
  });

  test('should follow a booking that was cancelled after the report was opened when the page is read again', async ({ browser, baseURL }) => {
    test.setTimeout(150_000);
    const first = page.waitForResponse(isReport('appointments'));
    await page.goto('/admin/analytics');
    const before = (await (await first).json()) as AppointmentsReport;

    const patient = await openStoredSession(browser, baseURL, 'PATIENT', 2);
    try {
      const { id } = await bookAnyFreeSlotAs(patient.page);
      await cancelAppointmentAs(patient.page, id);
    } finally {
      await patient.context.close();
    }

    // The read model is filled by a worker from the events, so the page is reloaded (a fresh read: applying the same period
    // again would be answered from the client cache) until the cancellation is in.
    await expect(async () => {
      const again = page.waitForResponse(isReport('appointments'));
      await page.reload();
      const after = (await (await again).json()) as AppointmentsReport;
      expect(after.cancelled).toBeGreaterThan(before.cancelled);
    }).toPass({ timeout: AUDIT_WRITE_TIMEOUT_MS, intervals: [3_000, 5_000] });
  });

  test('should send the chosen top and period and show the no-data notice for a period without appointments', async () => {
    await page.goto('/admin/analytics');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Топ услуг').selectOption('5');
    const services = page.waitForResponse(isReport('services-popularity'));
    await page.getByRole('button', { name: 'Показать' }).click();
    expect(new URL((await services).url()).searchParams.get('top')).toBe('5');
    await expect(page.getByRole('table', { name: 'Топ-5 услуг по записям' })).toBeVisible();

    await page.getByLabel('С', { exact: true }).fill('2020-01-01');
    await page.getByLabel('По', { exact: true }).fill('2020-01-31');
    const empty = page.waitForResponse(isReport('appointments'));
    await page.getByRole('button', { name: 'Показать' }).click();
    const url = new URL((await empty).url());
    expect([url.searchParams.get('from'), url.searchParams.get('to')]).toEqual(['2020-01-01', '2020-01-31']);
    await expect(page.getByText(NO_DATA)).toHaveCount(3);
  });

  test('should refuse a period that ends before it starts without sending a request', async () => {
    await page.goto('/admin/analytics');
    await page.waitForLoadState('networkidle');
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/analytics/')) sent.push(request.url());
    });
    await page.getByLabel('С', { exact: true }).fill('2026-06-10');
    await page.getByLabel('По', { exact: true }).fill('2026-06-01');
    await page.getByRole('button', { name: 'Показать' }).click();

    await expect(page.getByText('Дата начала позже даты окончания')).toBeVisible();
    expect(sent).toEqual([]);
  });
});

test.describe('admin audit journal', () => {
  test.describe.configure({ mode: 'serial', timeout: 2 * AUDIT_WRITE_TIMEOUT_MS });
  let context: BrowserContext;
  let page: Page;
  let adminSub: string;
  let roomId: string;

  async function adminApi(path: string): Promise<{ readonly items: ReadonlyArray<{ readonly action: string }> }> {
    const response = await page.request.get(path, { headers: { Authorization: `Bearer ${await accessTokenOf(page)}` } });
    return (await response.json()) as { items: ReadonlyArray<{ action: string }> };
  }

  async function applyFilters(filters: { readonly entity?: string; readonly userId?: string; readonly from?: string; readonly to?: string }): Promise<Response> {
    if (filters.from !== undefined) await page.getByLabel('С', { exact: true }).fill(filters.from);
    if (filters.to !== undefined) await page.getByLabel('По', { exact: true }).fill(filters.to);
    await page.getByLabel('Ресурс').fill(filters.entity ?? '');
    await page.getByLabel('Пользователь').fill(filters.userId ?? '');
    const answered = page.waitForResponse(isAudit);
    await page.getByRole('button', { name: 'Применить' }).click();
    return answered;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context, page } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
    adminSub = await subjectOf(page);
    const headers = { Authorization: `Bearer ${await accessTokenOf(page)}` };
    const identifier = `E2E${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const created = await page.request.post('/api/v1/admin/rooms', { headers, data: { identifier, name: `Кабинет ${identifier}`, floor: 1 } });
    expect(created.status(), 'the admin creates a room').toBe(201);
    roomId = ((await created.json()) as { id: string }).id;
    const removed = await page.request.delete(`/api/v1/admin/rooms/${roomId}`, { headers });
    expect(removed.status(), 'the admin deletes the room again').toBe(204);
    // The AuditEvents are written by a worker: wait until both are in the journal before the UI is asked for them.
    await expect
      .poll(async () => (await adminApi(`/api/v1/admin/audit?entity=${encodeURIComponent(`Location/${roomId}`)}`)).items.map((item) => item.action).sort(), { timeout: AUDIT_WRITE_TIMEOUT_MS, intervals: [2_000] })
      .toEqual(['create', 'delete']);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.beforeEach(async () => {
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: 'Журнал аудита', level: 1 })).toBeVisible();
  });

  test('should find the create and the delete of the room by its resource', async () => {
    const answered = await applyFilters({ entity: `Location/${roomId}` });
    expect(new URL(answered.url()).searchParams.get('entity')).toBe(`Location/${roomId}`);

    await expect(page.getByRole('status').filter({ hasText: 'Найдено событий' })).toHaveText('Найдено событий: 2');
    const rows = page.getByRole('table', { name: 'Журнал аудита' }).getByRole('row').filter({ hasText: `Location/${roomId}` });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Создание' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Удаление' })).toHaveCount(1);
    await expect(rows.first()).toContainText(adminSub);
  });

  test('should narrow by resource type: every row is a Location and the events of the room are among them', async () => {
    await applyFilters({ entity: 'Location' });

    const table = page.getByRole('table', { name: 'Журнал аудита' });
    const body = table.getByRole('row').filter({ has: page.locator('td') });
    await expect(body.first()).toBeVisible();
    for (const row of await body.all()) await expect(row).toContainText('Location/');
    await expect(page.getByRole('status').filter({ hasText: 'Найдено событий' })).not.toHaveText('Найдено событий: 0');
  });

  test('should filter by actor: the administrator sees the events, another account sees none', async () => {
    await applyFilters({ entity: `Location/${roomId}`, userId: adminSub });
    await expect(page.getByRole('status').filter({ hasText: 'Найдено событий' })).toHaveText('Найдено событий: 2');

    await applyFilters({ entity: `Location/${roomId}`, userId: randomUUID() });
    await expect(page.getByText('События не найдены')).toBeVisible();
  });

  test('should filter by period: today holds the events, a past day does not', async () => {
    // API §0: a date-only `from`/`to` is a UTC day, so «today» is the UTC date (the Minsk date differs between 00:00 and 03:00 local).
    const utcDay = (date: Date): string => date.toISOString().slice(0, 10);
    const today = utcDay(new Date());
    const yesterdayOf = (day: string): string => utcDay(new Date(Date.parse(`${day}T12:00:00Z`) - 24 * 60 * 60 * 1000));
    const past = yesterdayOf(yesterdayOf(today));

    await applyFilters({ entity: `Location/${roomId}`, from: today, to: today });
    await expect(page.getByRole('status').filter({ hasText: 'Найдено событий' })).toHaveText('Найдено событий: 2');

    const answered = await applyFilters({ entity: `Location/${roomId}`, from: past, to: past });
    expect([new URL(answered.url()).searchParams.get('from'), new URL(answered.url()).searchParams.get('to')]).toEqual([past, past]);
    await expect(page.getByText('События не найдены')).toBeVisible();
  });

  test('should refuse a malformed resource without sending a request', async () => {
    await page.waitForLoadState('networkidle');
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/admin/audit')) sent.push(request.url());
    });
    await page.getByLabel('Ресурс').fill('location/lower-case');
    await page.getByRole('button', { name: 'Применить' }).click();

    await expect(page.getByText('Укажите тип ресурса с заглавной буквы или Тип/id')).toBeVisible();
    expect(sent).toEqual([]);
  });
});
