import { fetchNotifications, fetchUnreadCount, markNotificationRead } from './notification-api';

jest.mock('@/lib/api/api-fetch', () => ({ apiFetch: jest.fn() }));

import { apiFetch } from '@/lib/api/api-fetch';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

describe('notification-api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('should read the unread counter from the real /notifications/unread-count path and its count field', async () => {
    apiFetchMock.mockResolvedValueOnce({ count: 42 });

    await expect(fetchUnreadCount()).resolves.toBe(42);

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/notifications/unread-count');
  });

  it('should treat a body without a numeric count as zero rather than NaN', async () => {
    apiFetchMock.mockResolvedValueOnce({ unread: 5 });

    await expect(fetchUnreadCount()).resolves.toBe(0);
  });

  it('should list notifications with paging and the unread filter', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [], meta: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 } });

    await fetchNotifications({ page: 2, pageSize: 10, unread: true });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/notifications?page=2&pageSize=10&unread=true');
  });

  it('should not send unread=false because the server only knows unread=true', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [], meta: {} });

    await fetchNotifications({ unread: false });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/notifications');
  });

  it('should POST to the read endpoint of the notification id', async () => {
    apiFetchMock.mockResolvedValueOnce(undefined);

    await markNotificationRead('n 1');

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/notifications/n%201/read', { method: 'POST' });
  });
});
