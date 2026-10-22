import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationItem } from '@/lib/notifications/notification-api';
import { useToastStore } from '@/store/use-toast-store';
import { LONG_UNBROKEN_TEXT } from './cabinet-fixtures';
import { apiProblem, expectWraps, newQueryClient, pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { NotificationCenter } from './notification-center';

jest.mock('@/lib/notifications/notification-api', () => ({ fetchNotifications: jest.fn(), fetchUnreadCount: jest.fn(), markNotificationRead: jest.fn() }));

import { fetchNotifications, fetchUnreadCount, markNotificationRead } from '@/lib/notifications/notification-api';

const listMock = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const countMock = fetchUnreadCount as jest.MockedFunction<typeof fetchUnreadCount>;
const markMock = markNotificationRead as jest.MockedFunction<typeof markNotificationRead>;

function notification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 'n-1', category: 'appointment', text: 'Запись на приём отменена. Причина: болею', sent: '2026-10-16T07:27:29.396Z', read: false, ...overrides };
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should list the first page with the category, the time in Minsk and a marker on unread items only', async () => {
    listMock.mockResolvedValue(pageOf([notification(), notification({ id: 'n-2', category: 'encounter', read: true, text: 'Приём завершён' })]));

    renderWithClient(<NotificationCenter />);

    const list = await screen.findByRole('group', { name: 'Список уведомлений' });
    const [unreadRow, readRow] = within(list).getAllByRole('listitem');
    expect(within(unreadRow as HTMLElement).getByText('Запись')).toBeInTheDocument();
    expect(within(unreadRow as HTMLElement).getByText('Новое')).toBeInTheDocument();
    expect(within(unreadRow as HTMLElement).getByText(/10:27/)).toBeInTheDocument();
    expect(within(readRow as HTMLElement).getByText('Приём')).toBeInTheDocument();
    expect(within(readRow as HTMLElement).queryByText('Новое')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith({ page: 1, pageSize: 10, unread: false });
  });

  it('should show instants inside the server text in clinic time instead of raw UTC', async () => {
    listMock.mockResolvedValue(pageOf([notification({ text: 'Вы записаны на приём. Начало: 2026-10-19T11:40:00.000Z' })]));

    renderWithClient(<NotificationCenter />);

    expect(await screen.findByText(/Вы записаны на приём\. Начало: .*14:40/)).toBeInTheDocument();
    expect(screen.queryByText(/T11:40/)).not.toBeInTheDocument();
  });

  it('should offer "mark as read" only for unread items and describe the button by the notification text', async () => {
    listMock.mockResolvedValue(pageOf([notification(), notification({ id: 'n-2', read: true })]));

    renderWithClient(<NotificationCenter />);

    const buttons = await screen.findAllByRole('button', { name: 'Отметить прочитанным' });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleDescription('Запись на приём отменена. Причина: болею');
  });

  it('should ask only for unread notifications and start from page 1 when the unread tab is chosen', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    renderWithClient(<NotificationCenter />);
    await screen.findByRole('list');

    await userEvent.click(screen.getByRole('tab', { name: 'Непрочитанные' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ page: 1, pageSize: 10, unread: true }));
  });

  it('should say there is nothing unread when the unread tab is empty', async () => {
    listMock.mockResolvedValueOnce(pageOf([notification()]));
    renderWithClient(<NotificationCenter />);
    await screen.findByRole('list');
    listMock.mockResolvedValue(pageOf([]));

    await userEvent.click(screen.getByRole('tab', { name: 'Непрочитанные' }));

    expect(await screen.findByText('Непрочитанных уведомлений нет')).toBeInTheDocument();
  });

  it('should mark the notification read, refresh the list and the counter, announce it and keep the focus in the list', async () => {
    const client = newQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    listMock.mockResolvedValueOnce(pageOf([notification()]));
    listMock.mockResolvedValue(pageOf([notification({ read: true })]));
    markMock.mockResolvedValue(undefined);
    renderWithClient(<NotificationCenter />, client);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }));

    await waitFor(() => expect(markMock).toHaveBeenCalledWith('n-1'));

    await waitFor(() => expect(screen.queryByText('Новое')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Отметить прочитанным' })).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Уведомление отмечено прочитанным');
    expect(screen.getByRole('group', { name: 'Список уведомлений' })).toHaveFocus();
  });

  it('should disable the button and say so while the request is running', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    markMock.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<NotificationCenter />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }));

    expect(await screen.findByRole('button', { name: 'Отмечаем…' })).toBeDisabled();
  });

  it('should show the problem and read the list again when marking fails', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    markMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-11' }));
    renderWithClient(<NotificationCenter />);
    await screen.findByRole('list');
    listMock.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Отметить прочитанным' }));

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-11');
    await waitFor(() => expect(listMock).toHaveBeenCalled());
  });

  it('should read the next server page when the pager is used', async () => {
    listMock.mockResolvedValue(pageOf([notification()], { totalItems: 25 }));
    renderWithClient(<NotificationCenter />);
    await screen.findByRole('list');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ page: 2, pageSize: 10, unread: false }));
  });

  it('should show the empty state when there are no notifications at all', async () => {
    listMock.mockResolvedValue(pageOf([]));

    renderWithClient(<NotificationCenter />);

    expect(await screen.findByText('Уведомлений нет')).toBeInTheDocument();
  });

  it('should show a loading skeleton while the list is being read', () => {
    listMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<NotificationCenter />);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should show a banner with the request id and retry when the service fails', async () => {
    listMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-12' }));
    listMock.mockResolvedValue(pageOf([notification()]));
    renderWithClient(<NotificationCenter />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-12');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('group', { name: 'Список уведомлений' })).toBeInTheDocument();
  });

  it('should not read anything for a viewer who is not a patient', async () => {
    resetCabinetState();
    const { useSessionStore } = await import('@/store/use-session-store');
    useSessionStore.setState({ role: 'DOCTOR' });

    renderWithClient(<NotificationCenter />);

    expect(listMock).not.toHaveBeenCalled();
  });

  it('should keep the focus on the page and announce the empty list when the last unread notification is marked read', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    markMock.mockResolvedValue(undefined);
    renderWithClient(<NotificationCenter />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Непрочитанные' }));
    const button = await screen.findByRole('button', { name: 'Отметить прочитанным' });
    listMock.mockResolvedValue(pageOf([]));

    await userEvent.click(button);

    expect(await screen.findByText('Непрочитанных уведомлений нет')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveFocus());
    expect(document.body).not.toHaveFocus();
    expect(screen.getByTestId('empty-state').closest('[role="status"]')).not.toBeNull();
  });

  it('should drop the banner of a failed mark-as-read when another tab is chosen', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    markMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-13' }));
    renderWithClient(<NotificationCenter />);
    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }));
    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-13');

    await userEvent.click(screen.getByRole('tab', { name: 'Непрочитанные' }));

    await waitFor(() => expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument());
  });

  it('should drop the banner of a failed mark-as-read when another page is chosen', async () => {
    listMock.mockResolvedValue(pageOf([notification()], { totalItems: 25 }));
    markMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-14' }));
    renderWithClient(<NotificationCenter />);
    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }));
    await screen.findByTestId('problem-banner');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument());
  });

  it('should say the server cannot be reached, without an error code, when the connection is lost while marking', async () => {
    listMock.mockResolvedValue(pageOf([notification()]));
    markMock.mockRejectedValue(apiProblem(0, 'INTERNAL'));
    renderWithClient(<NotificationCenter />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанным' }));

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByTestId('code-chip')).not.toBeInTheDocument();
  });

  it('should let a notification text without spaces wrap so every mark-as-read button stays on screen', async () => {
    listMock.mockResolvedValue(pageOf([notification({ text: `Запись на приём отменена. Причина: ${LONG_UNBROKEN_TEXT}` })]));

    renderWithClient(<NotificationCenter />);

    expectWraps(await screen.findByText(LONG_UNBROKEN_TEXT, { exact: false }));
  });

  it('should show one heading and a banner with a retry, not a second not-found screen, when the read answers 404', async () => {
    listMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-15' }));

    renderWithClient(<NotificationCenter />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-15');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
  it('should group the page by clinic day under a heading and show the unread count of the bell in the header', async () => {
    countMock.mockResolvedValue(79);
    listMock.mockResolvedValue(pageOf([
      notification({ id: 'a', sent: '2026-10-19T08:06:00Z' }),
      notification({ id: 'b', sent: '2026-10-17T09:37:00Z' }),
    ]));

    renderWithClient(<NotificationCenter />);

    expect(await screen.findByRole('heading', { level: 2, name: /19 октября/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /17 октября/ })).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(await screen.findByText('Непрочитанных: 79')).toBeInTheDocument();
  });

  it('should lead a finished visit to the history and offer no link for a booking without an appointment id', async () => {
    listMock.mockResolvedValue(pageOf([notification({ id: 'a', category: 'encounter', text: 'Приём завершён' }), notification({ id: 'b' })]));

    renderWithClient(<NotificationCenter />);

    const link = await screen.findByRole('link', { name: 'Открыть в истории' });
    expect(link).toHaveAttribute('href', '/history');
    expect(screen.queryByRole('link', { name: 'Открыть запись' })).not.toBeInTheDocument();
  });

  it('should narrow the page to one type without asking the server and say so when none is left', async () => {
    listMock.mockResolvedValue(pageOf([notification({ id: 'a', text: 'Запись создана' })]));
    renderWithClient(<NotificationCenter />);
    await screen.findByText('Запись создана');

    await userEvent.click(screen.getByRole('tab', { name: 'Приёмы' }));

    expect(await screen.findByText('На этой странице таких уведомлений нет')).toBeInTheDocument();
    expect(screen.queryByText('Запись создана')).not.toBeInTheDocument();
    expect(listMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, unread: false });
  });

  it('should mark every unread notification of the page with one request each and refresh the counter', async () => {
    const client = newQueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    listMock.mockResolvedValue(pageOf([notification({ id: 'a' }), notification({ id: 'b' }), notification({ id: 'c', read: true })]));
    markMock.mockResolvedValue(undefined);
    renderWithClient(<NotificationCenter />, client);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанными на странице' }));

    await waitFor(() => expect(markMock).toHaveBeenCalledTimes(2));
    expect(markMock).toHaveBeenCalledWith('a');
    expect(markMock).toHaveBeenCalledWith('b');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] }));
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Уведомления на странице отмечены прочитанными');
  });

  it('should not offer to mark the page when nothing on it is unread', async () => {
    listMock.mockResolvedValue(pageOf([notification({ read: true })]));

    renderWithClient(<NotificationCenter />);

    await screen.findByRole('group', { name: 'Список уведомлений' });
    expect(screen.queryByRole('button', { name: 'Отметить прочитанными на странице' })).not.toBeInTheDocument();
  });

  it('should show the problem when one of the requests of the page-wide mark fails', async () => {
    listMock.mockResolvedValue(pageOf([notification({ id: 'a' }), notification({ id: 'b' })]));
    markMock.mockImplementation((id) => (id === 'b' ? Promise.reject(apiProblem(500, 'INTERNAL', { requestId: 'req-16' })) : Promise.resolve()));
    renderWithClient(<NotificationCenter />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить прочитанными на странице' }));

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-16');
  });
});
