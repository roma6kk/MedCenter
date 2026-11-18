import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { authHeaders, bookSlotAs, cancelAppointmentAs, clinicDay, findFreeSlots, type FreeSlot } from './fixtures/booking-api';
import { isPostTo } from './fixtures/network';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const DIAGNOSIS_CODE = 'J06.9';
const TEMPERATURE_VALUE = '36.6';
const TEMPERATURE_UNIT = 'Cel';
const DRUG_CODE = 'J01FA10';
const SUMMARY = 'ОРВИ, состояние удовлетворительное';
const DOSAGE = '1 таб 1 раз в день';
const RECOMMENDATIONS = 'Обильное питьё и покой';
const DOCTOR_SUMMARY = 'Заключение, оформленное параллельно';

interface Visit {
  readonly appointmentId: string;
  readonly slot: FreeSlot;
}

interface EncounterRecord {
  readonly status: string;
  readonly diagnoses: ReadonlyArray<{ readonly code: string }>;
  readonly observations: ReadonlyArray<{ readonly value: number; readonly unit: string }>;
  readonly medicationRequests: ReadonlyArray<{ readonly atcCode: string }>;
}

const isCompleteCall = isPostTo(/\/api\/v1\/encounters\/[^/]+\/complete$/);

test.describe('doctor completes an encounter', () => {
  test.describe.configure({ mode: 'serial' });
  let patientContext: BrowserContext;
  let doctorContext: BrowserContext;
  let patientPage: Page;
  let doctorPage: Page;
  let first: Visit;
  let second: Visit;

  async function doctorApi(path: string, method: 'GET' | 'POST', data?: unknown): Promise<APIResponse> {
    const headers = await authHeaders(doctorPage);
    return method === 'GET' ? doctorPage.request.get(path, { headers }) : doctorPage.request.post(path, { headers, data });
  }

  async function bookVisits(slots: ReadonlyArray<FreeSlot>): Promise<Visit[]> {
    const visits: Visit[] = [];
    for (const slot of slots) {
      const booked = await bookSlotAs(patientPage, slot.slotId);
      expect(booked.status, 'the patient books the slot of the doctor').toBe(201);
      visits.push({ appointmentId: String(booked.body['id']), slot });
    }
    return visits;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    const doctor = loadDemoAccount('DOCTOR', 0);
    ({ context: patientContext, page: patientPage } = await openStoredSession(browser, baseURL, 'PATIENT', 0));
    ({ context: doctorContext, page: doctorPage } = await openStoredSession(browser, baseURL, 'DOCTOR', 0));
    expect(doctor.practitionerRoleId, 'the seeded doctor account is linked to a PractitionerRole').toBeDefined();
    const slots = await findFreeSlots(patientPage.request, 2, doctor.practitionerRoleId);
    [first, second] = (await bookVisits(slots)) as [Visit, Visit];
  });

  test.afterAll(async () => {
    for (const visit of [first, second]) if (visit !== undefined) await cancelAppointmentAs(patientPage, visit.appointmentId);
    await patientContext.close();
    await doctorContext.close();
  });

  test('should complete the encounter from the journal with a diagnosis, a temperature and a drug in one submit', async () => {
    const page = doctorPage;
    const time = new Intl.DateTimeFormat('ru-BY', { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(first.slot.start));

    await page.goto(`/doctor/appointments?date=${clinicDay(new Date(first.slot.start))}`);
    const row = page.getByTestId(`journal-visit-${first.appointmentId}`);
    await expect(row).toBeVisible();
    const opened = page.waitForResponse(isPostTo('/api/v1/encounters'));
    await page.getByRole('button', { name: new RegExp(`^Открыть приём: .*${time}$`) }).first().click();
    const notToday = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Приём не на сегодня' }) });
    await notToday.getByRole('button', { name: 'Начать сейчас' }).click();
    expect((await opened).status()).toBe(201);
    await page.waitForURL(/\/encounters\/[^/]+$/);
    const encounterId = new URL(page.url()).pathname.split('/').pop() as string;

    await page.getByLabel('Заключение', { exact: true }).fill(SUMMARY);

    await page.getByRole('combobox', { name: /^Диагноз 1:/ }).fill(DIAGNOSIS_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DIAGNOSIS_CODE.replace('.', '\\.')}`) }).first().click();
    await expect(page.getByRole('combobox', { name: /^Диагноз 1:/ })).toHaveValue(/ — .+/);

    await page.getByRole('button', { name: 'Добавить наблюдение' }).click();
    const indicator = page.getByLabel('Показатель 1');
    const temperature = indicator.locator('option', { hasText: /температур/i }).first();
    await expect(temperature).toBeAttached();
    await indicator.selectOption((await temperature.getAttribute('value')) as string);
    await page.getByLabel('Значение 1', { exact: true }).fill(TEMPERATURE_VALUE);
    const unit = page.getByLabel('Единица 1');
    await expect(unit.locator(`option[value="${TEMPERATURE_UNIT}"]`)).toBeAttached();
    await unit.selectOption(TEMPERATURE_UNIT);

    await page.getByRole('button', { name: 'Добавить лекарство' }).click();
    await page.getByRole('combobox', { name: /^Код АТХ/ }).fill(DRUG_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DRUG_CODE}`) }).first().click();
    await page.getByLabel('Дозировка 1').fill(DOSAGE);

    await page.getByLabel('Рекомендации', { exact: true }).fill(RECOMMENDATIONS);

    const completed = page.waitForResponse(isCompleteCall);
    await page.getByRole('button', { name: 'Завершить приём' }).click();
    expect((await completed).status()).toBe(200);

    const banner = page.getByTestId('encounter-readonly');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Приём завершён');
    await expect(page.getByRole('button', { name: 'Завершить приём' })).toHaveCount(0);
    const record = page.getByTestId('encounter-record');
    await expect(record).toContainText(SUMMARY);
    await expect(record).toContainText(DIAGNOSIS_CODE);
    await expect(record).toContainText(`${TEMPERATURE_VALUE.replace('.', ',')} °C`);
    await expect(record).toContainText(DRUG_CODE);
    await expect(record).toContainText(DOSAGE);

    const encounter = (await (await doctorApi(`/api/v1/encounters/${encounterId}`, 'GET')).json()) as EncounterRecord;
    expect(encounter.status).toBe('finished');
    expect(encounter.diagnoses.map((diagnosis) => diagnosis.code)).toEqual([DIAGNOSIS_CODE]);
    expect(encounter.observations).toEqual([expect.objectContaining({ value: Number(TEMPERATURE_VALUE), unit: TEMPERATURE_UNIT })]);
    expect(encounter.medicationRequests.map((drug) => drug.atcCode)).toEqual([DRUG_CODE]);
    const appointment = await patientPage.request.get(`/api/v1/appointments/${first.appointmentId}`, { headers: await authHeaders(patientPage) });
    expect(((await appointment.json()) as { status: string }).status).toBe('fulfilled');

    await page.goto(`/doctor/appointments?date=${clinicDay(new Date(first.slot.start))}`);
    await expect(page.getByTestId(`journal-visit-${first.appointmentId}`).getByTestId('stamp-fulfilled')).toBeVisible();
  });

  test('should turn the form read-only when the same encounter is completed a second time (409 ENCOUNTER_STATE_INVALID)', async () => {
    const page = doctorPage;
    const opened = await doctorApi('/api/v1/encounters', 'POST', { appointmentId: second.appointmentId });
    expect(opened.status()).toBe(201);
    const encounterId = ((await opened.json()) as { id: string }).id;

    await page.goto(`/encounters/${encounterId}`);
    await page.getByLabel('Заключение', { exact: true }).fill(SUMMARY);
    await page.getByRole('combobox', { name: /^Диагноз 1:/ }).fill(DIAGNOSIS_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DIAGNOSIS_CODE.replace('.', '\\.')}`) }).first().click();
    await expect(page.getByRole('combobox', { name: /^Диагноз 1:/ })).toHaveValue(/ — .+/);
    await page.getByLabel('Рекомендации', { exact: true }).fill(RECOMMENDATIONS);

    const elsewhere = await doctorApi(`/api/v1/encounters/${encounterId}/complete`, 'POST', {
      summary: DOCTOR_SUMMARY,
      diagnoses: [{ code: DIAGNOSIS_CODE, display: 'Острая респираторная инфекция' }],
      recommendations: RECOMMENDATIONS,
      observations: [],
      serviceRequests: [],
      medicationRequests: [],
    });
    expect(elsewhere.status()).toBe(200);

    const replay = page.waitForResponse(isCompleteCall);
    await page.getByRole('button', { name: 'Завершить приём' }).click();
    const refused = await replay;
    expect(refused.status()).toBe(409);
    expect(((await refused.json()) as { errorCode: string }).errorCode).toBe('ENCOUNTER_STATE_INVALID');

    await expect(page.getByTestId('encounter-readonly')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завершить приём' })).toHaveCount(0);
    await expect(page.getByLabel('Заключение', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('encounter-record')).toContainText(DOCTOR_SUMMARY);
  });
});
