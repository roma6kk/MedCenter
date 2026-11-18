import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { bookAnyFreeSlotAs, cancelAppointmentAs, type FreeSlot } from './fixtures/booking-api';
import { isPostTo } from './fixtures/network';
import { hasDemoManifest } from './fixtures/demo-accounts';
import { openStoredSession } from './fixtures/session-state';

test.skip(!hasDemoManifest(), 'demo seed manifest not found');

const CANCEL_REASON = 'Неудобное время';

test.describe('admin cancels a patient appointment from the list', () => {
  let patientContext: BrowserContext;
  let adminContext: BrowserContext;
  let patientPage: Page;
  let adminPage: Page;
  let appointmentId: string;
  let slot: FreeSlot;

  test.beforeAll(async ({ browser, baseURL }) => {
    ({ context: patientContext, page: patientPage } = await openStoredSession(browser, baseURL, 'PATIENT', 0));
    ({ context: adminContext, page: adminPage } = await openStoredSession(browser, baseURL, 'ADMIN', 0));
    ({ id: appointmentId, slot } = await bookAnyFreeSlotAs(patientPage));
  });

  test.afterAll(async () => {
    await cancelAppointmentAs(patientPage, appointmentId);
    await patientContext.close();
    await adminContext.close();
  });

  test('should find the booking by filters, keep them in the URL and show the row cancelled', async () => {
    const when = new Intl.DateTimeFormat('ru-BY', { timeZone: 'Europe/Minsk', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(slot.start));
    const row = adminPage.getByRole('row').filter({ hasText: when });
    const doctorFilter = adminPage.getByLabel('Врач', { exact: true });
    const statusFilter = adminPage.getByLabel('Статус', { exact: true });

    await adminPage.goto('/admin/appointments');
    const doctorOption = doctorFilter.locator('option', { hasText: slot.doctorName.split(' ')[0] as string });
    await doctorFilter.selectOption((await doctorOption.getAttribute('value')) as string);
    await statusFilter.selectOption({ label: 'Записан' });
    await expect(adminPage).toHaveURL(/status=booked/);
    await expect(row).toBeVisible();

    await adminPage.reload();
    await expect(adminPage).toHaveURL(/status=booked/);
    await expect(statusFilter).toHaveValue('booked');
    await expect(doctorFilter.locator('option:checked')).toContainText(slot.doctorName.split(' ')[0] as string);
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /^Отменить запись/ }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'Отмена записи' });
    await dialog.getByRole('radio', { name: CANCEL_REASON }).check();
    const cancelled = adminPage.waitForResponse(isPostTo(`/api/v1/appointments/${appointmentId}/cancel`));
    await dialog.getByRole('button', { name: 'Подтвердить отмену' }).click();
    expect((await cancelled).ok()).toBe(true);
    await expect(dialog).toBeHidden();

    await statusFilter.selectOption({ label: 'Отменена' });
    await expect(row.getByTestId('stamp-cancelled')).toBeVisible();
  });
});
