import { expect, type Locator, type Page } from '@playwright/test';

export function cancelledNotificationRow(page: Page, appointmentId: string): Locator {
  return page
    .getByRole('group', { name: 'Список уведомлений' })
    .getByRole('listitem')
    .filter({ has: page.locator(`a[href="/appointments/${appointmentId}"]`), hasText: 'Запись на приём отменена.' });
}

// The notification is produced asynchronously (RabbitMQ → notification-service): re-read the list until it arrives.
export async function openNotificationsUntilCancelled(page: Page, appointmentId: string, timeout: number): Promise<Locator> {
  const row = cancelledNotificationRow(page, appointmentId);
  await expect(async () => {
    await page.goto('/notifications');
    await expect(row).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout, intervals: [2_000, 3_000, 5_000] });
  return row;
}
