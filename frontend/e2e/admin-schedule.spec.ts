/**
 * E2E — scenario D of the frontend design spec §6 (API 5.2.1–5.2.6, FR-020, BR-007): the admin creates a schedule, the overlap
 * control refuses a crossing one, the slots are generated, and they show up for the doctor and for the patient.
 *
 * Isolation: the schedule is made for one seeded doctor on three days chosen at random 40…300 days ahead — far beyond the
 * demo schedules (`--days 14`) and the other runs — with a single window on the weekday of the first day. The whole period
 * is the horizon, so «overlap» can be provoked by a second schedule that starts on the last day. Cleanup deletes the schedule
 * together with its free slots. Each role signs in once per run.
 */
import { randomInt } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';
import { accessTokenOf, clinicDay } from './fixtures/booking-api';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const WINDOW_START = '09:00';
const WINDOW_END = '10:00';
const MIN_DAYS_AHEAD = 40;
const MAX_DAYS_AHEAD = 300;
const HORIZON_DAYS = 3;

function addDays(day: string, days: number): string {
  const shifted = new Date(`${day}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** `2027-03-05` → `05.03.2027` as the admin table prints a horizon day. */
function numericDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
}

const isScheduleCreate = (response: Response): boolean => response.url().endsWith('/api/v1/admin/schedules') && response.request().method() === 'POST';

test.describe('admin creates a schedule and generates slots', () => {
  test.describe.configure({ mode: 'serial' });
  let contexts: BrowserContext[] = [];
  let adminPage: Page;
  let doctorPage: Page;
  let patientPage: Page;
  let doctorRoleId: string;
  let doctorName: string;
  let doctorId: string;
  let firstDay: string;
  let lastDay: string;
  let scheduleId: string | undefined;
  /** Every schedule a test of this run managed to create: all are deleted afterwards, whatever the verdict. */
  const createdIds: string[] = [];
  let generated = 0;

  async function signedInPage(browser: Browser, baseURL: string | undefined, role: 'ADMIN' | 'DOCTOR' | 'PATIENT', index = 0): Promise<Page> {
    const { context, page } = await openStoredSession(browser, baseURL, role, index);
    contexts.push(context);
    return page;
  }

  /** The row of the schedule under test in the admin table: found by its unique horizon. */
  function scheduleRow(): Locator {
    return adminPage.getByRole('row').filter({ hasText: `${numericDay(firstDay)} – ${numericDay(addDays(firstDay, HORIZON_DAYS - 1))}` });
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    // The fourth demo doctor: the other e2e specs use the first one.
    const doctor = loadDemoAccount('DOCTOR', 3);
    expect(doctor.practitionerRoleId, 'the seeded doctor account is linked to a PractitionerRole').toBeDefined();
    doctorRoleId = doctor.practitionerRoleId as string;
    firstDay = clinicDay(new Date(Date.now() + randomInt(MIN_DAYS_AHEAD, MAX_DAYS_AHEAD) * 24 * 60 * 60 * 1000));
    lastDay = addDays(firstDay, HORIZON_DAYS - 1);
    adminPage = await signedInPage(browser, baseURL, 'ADMIN');
    doctorPage = await signedInPage(browser, baseURL, 'DOCTOR', 3);
    patientPage = await signedInPage(browser, baseURL, 'PATIENT', 0);
    const doctors = await patientPage.request.get('/api/v1/doctors?pageSize=100');
    const items = ((await doctors.json()) as { items: ReadonlyArray<{ id: string; name: string; practitionerRoleIds?: ReadonlyArray<string> }> }).items;
    const mine = items.find((item) => item.practitionerRoleIds?.includes(doctorRoleId));
    expect(mine, 'the doctor of the account is in the public catalog').toBeDefined();
    doctorName = (mine as { name: string }).name;
    doctorId = (mine as { id: string }).id;
  });

  test.afterAll(async () => {
    for (const id of createdIds) {
      const token = await accessTokenOf(adminPage);
      const removed = await adminPage.request.delete(`/api/v1/admin/schedules/${id}`, { headers: { Authorization: `Bearer ${token}` }, data: { cascade: true } });
      // A failed cleanup must not fail the run (the schedule lies months ahead, no other run meets it) but must not stay unseen.
      if (!removed.ok()) console.warn(`cleanup: DELETE /api/v1/admin/schedules/${id} answered ${removed.status()}`);
    }
    await Promise.all(contexts.map((context) => context.close()));
    contexts = [];
  });

  test('should mark crossing windows and refuse the schedule before anything is sent', async () => {
    const page = adminPage;
    await page.goto('/admin/schedules');
    await page.getByRole('button', { name: 'Создать расписание' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое расписание' });
    await dialog.getByLabel('Врач').selectOption(doctorRoleId);
    await dialog.getByLabel('Кабинет').selectOption({ index: 1 });
    await dialog.getByLabel('Услуга').selectOption({ index: 1 });
    await dialog.getByLabel('Горизонт с').fill(firstDay);
    await dialog.getByLabel('Горизонт по').fill(lastDay);

    // Two windows of one weekday that cross: both rows are marked at once, the submit sends nothing.
    const weekday = WEEKDAY_CODES[new Date(`${firstDay}T12:00:00Z`).getUTCDay()] as string;
    await dialog.getByLabel('День недели, окно 1').selectOption(weekday);
    await dialog.getByLabel('Начало, окно 1').fill(WINDOW_START);
    await dialog.getByLabel('Окончание, окно 1').fill(WINDOW_END);
    await dialog.getByRole('button', { name: 'Добавить окно' }).click();
    await dialog.getByLabel('День недели, окно 2').selectOption(weekday);
    await dialog.getByLabel('Начало, окно 2').fill('09:30');
    await dialog.getByLabel('Окончание, окно 2').fill('10:30');
    await expect(dialog.getByTestId('window-row-0')).toHaveAttribute('data-overlap', 'true');
    await expect(dialog.getByTestId('window-row-1')).toHaveAttribute('data-overlap', 'true');
    await expect(dialog.getByText('Окно пересекается с другим окном этого дня')).toHaveCount(2);

    let sent = false;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/admin/schedules')) sent = true;
    });
    await dialog.getByRole('button', { name: 'Создать расписание' }).click();
    await expect(dialog.getByText('Окна одного дня пересекаются')).toBeVisible();
    expect(sent).toBe(false);
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();
  });

  test('should create the schedule with one window of that weekday', async () => {
    const page = adminPage;
    await page.goto('/admin/schedules');
    await page.getByRole('button', { name: 'Создать расписание' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое расписание' });
    await dialog.getByLabel('Врач').selectOption(doctorRoleId);
    await dialog.getByLabel('Кабинет').selectOption({ index: 1 });
    await dialog.getByLabel('Услуга').selectOption({ index: 1 });
    await dialog.getByLabel('Горизонт с').fill(firstDay);
    await dialog.getByLabel('Горизонт по').fill(lastDay);
    const weekday = WEEKDAY_CODES[new Date(`${firstDay}T12:00:00Z`).getUTCDay()] as string;
    await dialog.getByLabel('День недели, окно 1').selectOption(weekday);
    await dialog.getByLabel('Начало, окно 1').fill(WINDOW_START);
    await dialog.getByLabel('Окончание, окно 1').fill(WINDOW_END);

    const created = page.waitForResponse(isScheduleCreate);
    await dialog.getByRole('button', { name: 'Создать расписание' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    scheduleId = ((await response.json()) as { id: string }).id;
    createdIds.push(scheduleId);
    await expect(dialog).toBeHidden();
  });

  test('should refuse a second schedule of the same doctor whose horizon crosses it (409 SCHEDULE_OVERLAP)', async () => {
    const page = adminPage;
    await page.goto('/admin/schedules');
    await page.getByRole('button', { name: 'Создать расписание' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новое расписание' });
    await dialog.getByLabel('Врач').selectOption(doctorRoleId);
    await dialog.getByLabel('Кабинет').selectOption({ index: 1 });
    await dialog.getByLabel('Услуга').selectOption({ index: 1 });
    // BR-007: the horizons meet and the weekly windows of the same weekday cross (09:30–10:30 against 09:00–10:00).
    await dialog.getByLabel('Горизонт с').fill(lastDay);
    await dialog.getByLabel('Горизонт по').fill(addDays(lastDay, 7));
    const weekday = WEEKDAY_CODES[new Date(`${firstDay}T12:00:00Z`).getUTCDay()] as string;
    await dialog.getByLabel('День недели, окно 1').selectOption(weekday);
    await dialog.getByLabel('Начало, окно 1').fill('09:30');
    await dialog.getByLabel('Окончание, окно 1').fill('10:30');

    const refused = page.waitForResponse(isScheduleCreate);
    await dialog.getByRole('button', { name: 'Создать расписание' }).click();
    const response = await refused;
    if (response.status() === 201) createdIds.push(((await response.json()) as { id: string }).id);
    expect(response.status()).toBe(409);
    expect(((await response.json()) as { errorCode: string }).errorCode).toBe('SCHEDULE_OVERLAP');
    await expect(dialog.getByText('Расписание пересекается с другим расписанием этого врача')).toBeVisible();
    await expect(dialog.getByTestId('window-row-0')).toHaveAttribute('data-overlap', 'true');
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();
  });

  test('should generate the slots of the window and skip them on a repeated run', async () => {
    const page = adminPage;
    await page.goto('/admin/schedules');
    await page.getByLabel('Врач').first().selectOption(doctorRoleId);
    await expect(scheduleRow()).toBeVisible();
    await scheduleRow().getByRole('button', { name: /^Сгенерировать слоты/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Генерация слотов' });

    const run = page.waitForResponse((response) => response.url().endsWith(`/api/v1/admin/schedules/${scheduleId}/generate`) && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Сгенерировать', exact: true }).click();
    expect((await run).ok()).toBe(true);
    const result = dialog.getByTestId('generation-result');
    await expect(result).toContainText(/Создано слотов: \d+, пропущено \(уже были\): 0/);
    generated = Number(/Создано слотов: (\d+)/.exec((await result.textContent()) ?? '')?.[1]);
    expect(generated, 'the hour of the window is cut into slots').toBeGreaterThan(0);

    // The same period again creates nothing new: every slot is skipped.
    await dialog.getByRole('button', { name: 'Сгенерировать', exact: true }).click();
    await expect(result).toContainText(`Создано слотов: 0, пропущено (уже были): ${generated}`);
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
  });

  test('should show the generated slots to the doctor in their schedule', async () => {
    const page = doctorPage;
    await page.goto('/doctor/schedule');
    await page.getByLabel('С даты').fill(firstDay);
    const day = page.locator(`section[aria-labelledby="day-${firstDay}"]`);
    await expect(day).toBeVisible();
    await expect(day.getByRole('listitem')).toHaveCount(generated);
    await expect(day.getByRole('listitem').first()).toContainText(WINDOW_START);
  });

  test('should show the generated slots to the patient as free time of the doctor', async () => {
    const page = patientPage;
    await page.goto(`/doctors/${doctorId}`);
    await expect(page.getByRole('heading', { name: new RegExp(doctorName.split(' ').pop() as string) }).first()).toBeVisible();
    await page.getByLabel('Перейти к дате').fill(firstDay);
    const day = page.getByTestId(`slot-day-${firstDay}`);
    await expect(day).toBeVisible();
    await expect(day.getByRole('button')).toHaveCount(generated);
    await expect(day.getByRole('button').first()).toHaveAttribute('data-state', 'free');
  });
});
