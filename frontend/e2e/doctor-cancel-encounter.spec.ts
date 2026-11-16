import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { authHeaders, bookSlotAs, cancelAppointmentAs, clinicDay, findFreeSlots, type FreeSlot } from './fixtures/booking-api';
import { hasDemoManifest, loadDemoAccount } from './fixtures/demo-accounts';
import { isPostTo } from './fixtures/network';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

test.describe('doctor cancels an encounter', () => {
  let patientContext: BrowserContext;
  let doctorContext: BrowserContext;
  let patientPage: Page;
  let doctorPage: Page;
  let appointmentId: string;
  let slot: FreeSlot;
  let encounterId: string | undefined;

  async function openVisit(): Promise<string> {
    const time = new Intl.DateTimeFormat('ru-BY', { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(slot.start));
    await doctorPage.goto(`/doctor/appointments?date=${clinicDay(new Date(slot.start))}`);
    await expect(doctorPage.getByTestId(`journal-visit-${appointmentId}`)).toBeVisible();
    await doctorPage.getByRole('button', { name: new RegExp(`^Открыть приём: .*${time}$`) }).first().click();
    const notToday = doctorPage.getByRole('dialog').filter({ has: doctorPage.getByRole('heading', { name: 'Приём не на сегодня' }) });
    await notToday.getByRole('button', { name: 'Начать сейчас' }).click();
    await doctorPage.waitForURL(/\/encounters\/[^/]+$/);
    encounterId = new URL(doctorPage.url()).pathname.split('/').pop() as string;
    return encounterId;
  }

  test.beforeAll(async ({ browser, baseURL }) => {
    const doctor = loadDemoAccount('DOCTOR', 0);
    ({ context: patientContext, page: patientPage } = await openStoredSession(browser, baseURL, 'PATIENT', 0));
    ({ context: doctorContext, page: doctorPage } = await openStoredSession(browser, baseURL, 'DOCTOR', 0));
    expect(doctor.practitionerRoleId, 'the seeded doctor account is linked to a PractitionerRole').toBeDefined();
    [slot] = (await findFreeSlots(patientPage.request, 1, doctor.practitionerRoleId)) as [FreeSlot];
    const booked = await bookSlotAs(patientPage, slot.slotId);
    expect(booked.status, 'the patient books the slot of the doctor').toBe(201);
    appointmentId = String(booked.body['id']);
  });

  test.afterAll(async () => {
    if (encounterId !== undefined) await doctorPage.request.post(`/api/v1/encounters/${encounterId}/cancel`, { headers: await authHeaders(doctorPage) });
    await cancelAppointmentAs(patientPage, appointmentId);
    await patientContext.close();
    await doctorContext.close();
  });

  test('should return to the journal after the cancel and let the doctor open the same visit again', async () => {
    const firstEncounterId = await openVisit();

    await doctorPage.getByRole('button', { name: 'Отменить приём' }).click();
    const dialog = doctorPage.getByRole('dialog', { name: 'Отменить приём?' });
    const cancelled = doctorPage.waitForResponse(isPostTo(`/api/v1/encounters/${firstEncounterId}/cancel`));
    await dialog.getByRole('button', { name: 'Отменить приём' }).click();
    expect((await cancelled).ok()).toBe(true);
    await expect(doctorPage).toHaveURL(/\/doctor\/appointments/);
    await expect(doctorPage.getByText('Приём отменён')).toBeVisible();

    await openVisit();
    await expect(doctorPage.getByRole('button', { name: 'Завершить приём' })).toBeVisible();
  });
});
