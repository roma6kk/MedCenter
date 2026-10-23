/**
 * E2E — scenarios C and C2 of the frontend design spec §6 (FR-011…FR-014; BR-003/004/005/008/009).
 *
 * C: the doctor opens a booked appointment from the journal and completes the encounter with one atomic submit
 * (diagnosis J06.9, temperature 36.6 Cel, drug J01FA10): the appointment becomes «fulfilled» and the encounter «finished».
 * C2: a second completion of the same encounter is refused with 409 `ENCOUNTER_STATE_INVALID`, and the form turns read-only.
 *
 * Data: a patient WITH an EMR consent (the seeded `patient.novikov` has none on purpose) books two free slots of the seeded
 * doctor through the API at run time. The domain lets a doctor open any `booked` appointment (BR-008 has no «today» rule),
 * so a slot a day or two ahead is enough and the journal is opened on that day (`?date=`). A completed visit cannot be
 * reverted: every run uses up two slots of the doctor (`npm run seed:demo`, without `--users`, adds slots again).
 * Each side signs in once per run.
 */
import { expect, test, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test';
import { accessTokenOf, bookSlotAs, cancelAppointmentAs, clinicDay, findFreeSlots, type FreeSlot } from './fixtures/booking-api';
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

function isCompleteCall(response: Response): boolean {
  return /\/api\/v1\/encounters\/[^/]+\/complete$/.test(response.url()) && response.request().method() === 'POST';
}

test.describe('doctor completes an encounter', () => {
  test.describe.configure({ mode: 'serial' });
  let patientContext: BrowserContext;
  let doctorContext: BrowserContext;
  let patientPage: Page;
  let doctorPage: Page;
  let first: Visit;
  let second: Visit;

  async function doctorApi(path: string, method: 'GET' | 'POST', data?: unknown): Promise<APIResponse> {
    const headers = { Authorization: `Bearer ${await accessTokenOf(doctorPage)}` };
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
    // A completed visit stays; a visit the test never reached is cancelled so that its slot is free again.
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
    const opened = page.waitForResponse((response) => response.url().endsWith('/api/v1/encounters') && response.request().method() === 'POST');
    // The next visit of the day also has its call to action in the side panel, hence `.first()`.
    await page.getByRole('button', { name: new RegExp(`^Открыть приём: .*${time}$`) }).first().click();
    expect((await opened).status()).toBe(201);
    await page.waitForURL(/\/encounters\/[^/]+$/);
    const encounterId = new URL(page.url()).pathname.split('/').pop() as string;

    await page.getByLabel('Заключение', { exact: true }).fill(SUMMARY);

    // Diagnosis: type the code, pick it from the suggestions; the name is filled from the picked concept.
    await page.getByRole('combobox', { name: /^Код МКБ-10/ }).fill(DIAGNOSIS_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DIAGNOSIS_CODE.replace('.', '\\.')}`) }).first().click();
    await expect(page.getByLabel('Название диагноза 1')).not.toHaveValue('');

    // Observation: the body temperature from the closed НСИ list, the value and the UCUM unit.
    await page.getByRole('button', { name: 'Добавить наблюдение' }).click();
    const indicator = page.getByLabel('Показатель 1');
    const temperature = indicator.locator('option', { hasText: /температур/i }).first();
    await expect(temperature).toBeAttached();
    await indicator.selectOption((await temperature.getAttribute('value')) as string);
    await page.getByLabel('Значение 1', { exact: true }).fill(TEMPERATURE_VALUE);
    const unit = page.getByLabel('Единица UCUM 1');
    await expect(unit.locator(`option[value="${TEMPERATURE_UNIT}"]`)).toBeAttached();
    await unit.selectOption(TEMPERATURE_UNIT);

    // Drug: the АТХ code picked from the suggestions and its dosage.
    await page.getByRole('button', { name: 'Добавить лекарство' }).click();
    await page.getByRole('combobox', { name: /^Код АТХ/ }).fill(DRUG_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DRUG_CODE}`) }).first().click();
    await page.getByLabel('Дозировка 1').fill(DOSAGE);

    await page.getByLabel('Рекомендации', { exact: true }).fill(RECOMMENDATIONS);

    const completed = page.waitForResponse(isCompleteCall);
    await page.getByRole('button', { name: 'Завершить приём' }).click();
    expect((await completed).status()).toBe(200);

    // The form gives way to the read-only record with everything that was sent.
    const banner = page.getByTestId('encounter-readonly');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Приём завершён');
    await expect(page.getByRole('button', { name: 'Завершить приём' })).toHaveCount(0);
    const record = page.getByTestId('encounter-record');
    await expect(record).toContainText(SUMMARY);
    await expect(record).toContainText(DIAGNOSIS_CODE);
    await expect(record).toContainText(TEMPERATURE_VALUE);
    await expect(record).toContainText(TEMPERATURE_UNIT);
    await expect(record).toContainText(DRUG_CODE);
    await expect(record).toContainText(DOSAGE);

    // The service state behind it: the encounter is finished with all three records (7.3 is atomic), the appointment fulfilled.
    const encounter = (await (await doctorApi(`/api/v1/encounters/${encounterId}`, 'GET')).json()) as EncounterRecord;
    expect(encounter.status).toBe('finished');
    expect(encounter.diagnoses.map((diagnosis) => diagnosis.code)).toEqual([DIAGNOSIS_CODE]);
    expect(encounter.observations).toEqual([expect.objectContaining({ value: Number(TEMPERATURE_VALUE), unit: TEMPERATURE_UNIT })]);
    expect(encounter.medicationRequests.map((drug) => drug.atcCode)).toEqual([DRUG_CODE]);
    const patientToken = await accessTokenOf(patientPage);
    const appointment = await patientPage.request.get(`/api/v1/appointments/${first.appointmentId}`, { headers: { Authorization: `Bearer ${patientToken}` } });
    expect(((await appointment.json()) as { status: string }).status).toBe('fulfilled');

    // …and the journal says so.
    await page.goto(`/doctor/appointments?date=${clinicDay(new Date(first.slot.start))}`);
    await expect(page.getByTestId(`journal-visit-${first.appointmentId}`).getByTestId('stamp-fulfilled')).toBeVisible();
  });

  test('should turn the form read-only when the same encounter is completed a second time (409 ENCOUNTER_STATE_INVALID)', async () => {
    const page = doctorPage;
    const opened = await doctorApi('/api/v1/encounters', 'POST', { appointmentId: second.appointmentId });
    expect(opened.status()).toBe(201);
    const encounterId = ((await opened.json()) as { id: string }).id;

    // The form of the in-progress visit is on screen and filled in…
    await page.goto(`/encounters/${encounterId}`);
    await page.getByLabel('Заключение', { exact: true }).fill(SUMMARY);
    await page.getByRole('combobox', { name: /^Код МКБ-10/ }).fill(DIAGNOSIS_CODE);
    await page.getByRole('option', { name: new RegExp(`^${DIAGNOSIS_CODE.replace('.', '\\.')}`) }).first().click();
    await expect(page.getByLabel('Название диагноза 1')).not.toHaveValue('');
    await page.getByLabel('Рекомендации', { exact: true }).fill(RECOMMENDATIONS);

    // …while the visit is completed elsewhere (a second tab, a colleague, a retried request).
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

    // The encounter is re-read and shown as the finished record: the form and its submit are gone, nothing was overwritten.
    await expect(page.getByTestId('encounter-readonly')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завершить приём' })).toHaveCount(0);
    await expect(page.getByLabel('Заключение', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('encounter-record')).toContainText(DOCTOR_SUMMARY);
  });
});
