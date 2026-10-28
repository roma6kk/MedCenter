import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { NotificationBell } from './notification-bell';
import { PANEL_ITEMS } from './notification-bell-panel';
import { PULSE_MS } from './use-count-pulse';

jest.mock('@/lib/notifications/notification-api', () => ({
  fetchUnreadCount: jest.fn(),
  fetchNotifications: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  markNotificationRead: jest.fn(),
}));

const mockPathname = jest.fn<string | null, []>();
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '@/lib/notifications/notification-api';

const unreadMock = fetchUnreadCount as jest.MockedFunction<typeof fetchUnreadCount>;
const listMock = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const markAllMock = markAllNotificationsRead as jest.MockedFunction<typeof markAllNotificationsRead>;
const markOneMock = markNotificationRead as jest.MockedFunction<typeof markNotificationRead>;

const SIGNED_OUT = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: true };

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return { id: 'n1', category: 'appointment', text: 'Вы записаны на приём.', sent: '2026-10-28T12:21:00Z', read: false, appointmentId: 'a1', ...overrides };
}

function page(items: ReadonlyArray<NotificationItem>): Awaited<ReturnType<typeof fetchNotifications>> {
  return { items, meta: { page: 1, pageSize: PANEL_ITEMS, totalItems: items.length, totalPages: 1 } };
}

function renderBell(client: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): ReturnType<typeof render> {
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<NotificationBell />, { wrapper: Wrapper });
}

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPathname.mockReturnValue('/home');
    useUiStore.setState({ locale: 'ru' });
    useSessionStore.setState({ ...SIGNED_OUT, role: 'PATIENT' });
  });

  it('should show the unread count from {count} as a badge and in the accessible name of the bell button', async () => {
    unreadMock.mockResolvedValue(5);

    renderBell();

    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 5' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('should announce the count through a polite live region for screen readers', async () => {
    unreadMock.mockResolvedValue(2);

    renderBell();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Непрочитанных уведомлений: 2'));
  });

  it('should hide the badge when nothing is unread', async () => {
    unreadMock.mockResolvedValue(0);

    renderBell();

    await waitFor(() => expect(unreadMock).toHaveBeenCalled());
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('should cap the badge at 99+', async () => {
    unreadMock.mockResolvedValue(120);

    renderBell();

    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('99+');
  });

  it('should render in English when the locale is en', async () => {
    useUiStore.setState({ locale: 'en' });
    unreadMock.mockResolvedValue(1);

    renderBell();

    expect(await screen.findByRole('button', { name: 'Notifications, unread: 1' })).toBeInTheDocument();
  });

  it.each([['DOCTOR'], ['ADMIN']] as const)('should render nothing and call no API for a %s', (role) => {
    useSessionStore.setState({ ...SIGNED_OUT, role });

    renderBell();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(unreadMock).not.toHaveBeenCalled();
  });

  describe('dropdown', () => {
    async function openBell(): Promise<HTMLElement> {
      await userEvent.click(await screen.findByRole('button', { name: /Уведомления, непрочитанных/ }));
      return screen.findByRole('dialog', { name: 'Последние уведомления' });
    }

    it('should read nothing until the bell is opened, then list at most the latest five with a link to all of them', async () => {
      unreadMock.mockResolvedValue(7);
      listMock.mockResolvedValue(page(Array.from({ length: 7 }, (_, index) => item({ id: `n${index}`, text: `Сообщение ${index}`, read: true }))));
      renderBell();
      await screen.findByTestId('unread-badge');
      expect(listMock).not.toHaveBeenCalled();

      const panel = await openBell();

      expect(listMock).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
      expect(await within(panel).findAllByRole('listitem')).toHaveLength(5);
      expect(within(panel).getByRole('link', { name: 'Все уведомления' })).toHaveAttribute('href', '/notifications');
    });

    it('should lead a booking notification to its appointment and mark it read when it is opened', async () => {
      unreadMock.mockResolvedValue(1);
      listMock.mockResolvedValue(page([item()]));
      markOneMock.mockResolvedValue(undefined);
      renderBell();

      const panel = await openBell();
      const link = await within(panel).findByRole('link', { name: /Вы записаны на приём/ });
      expect(link).toHaveAttribute('href', '/appointments/a1');
      expect(within(panel).getByTestId('panel-unread-dot')).toBeInTheDocument();
      await userEvent.click(link);

      await waitFor(() => expect(markOneMock).toHaveBeenCalledWith('n1'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should mark everything read with one request and refresh the counter', async () => {
      unreadMock.mockResolvedValueOnce(2).mockResolvedValue(0);
      listMock.mockResolvedValue(page([item(), item({ id: 'n2' })]));
      markAllMock.mockResolvedValue(2);
      renderBell();

      const panel = await openBell();
      await userEvent.click(await within(panel).findByRole('button', { name: 'Отметить все прочитанными' }));

      await waitFor(() => expect(markAllMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Уведомления, непрочитанных: 0' })).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Отметить все прочитанными' })).not.toBeInTheDocument();
    });

    it('should say there is nothing yet when the list is empty, and offer no «mark all»', async () => {
      unreadMock.mockResolvedValue(0);
      listMock.mockResolvedValue(page([]));
      renderBell();

      const panel = await openBell();

      expect(await within(panel).findByText('Уведомлений пока нет')).toBeInTheDocument();
      expect(within(panel).queryByRole('button', { name: 'Отметить все прочитанными' })).not.toBeInTheDocument();
    });

    it('should close on Escape and give the focus back to the bell', async () => {
      unreadMock.mockResolvedValue(0);
      listMock.mockResolvedValue(page([]));
      renderBell();
      await openBell();

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Уведомления, непрочитанных/ })).toHaveFocus();
    });

    it('should close on a press outside', async () => {
      unreadMock.mockResolvedValue(0);
      listMock.mockResolvedValue(page([]));
      renderBell();
      await openBell();

      await userEvent.click(document.body);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should show a retry inside the dropdown when the list cannot be read', async () => {
      unreadMock.mockResolvedValue(1);
      listMock.mockRejectedValue(new Error('boom'));
      renderBell();

      const panel = await openBell();

      expect(await within(panel).findByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    });
  });

  describe('new unread arriving', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
    afterEach(() => jest.useRealTimers());

    it('should pulse the badge when the count goes up while the page is open, and stop after a moment', async () => {
      unreadMock.mockResolvedValueOnce(1).mockResolvedValue(2);
      renderBell();
      expect(await screen.findByTestId('unread-badge')).not.toHaveAttribute('data-pulsing');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      await waitFor(() => expect(screen.getByTestId('unread-badge')).toHaveTextContent('2'));
      expect(screen.getByTestId('unread-badge')).toHaveAttribute('data-pulsing', 'true');
      expect(screen.getByTestId('unread-badge').className).toContain('animate-badge-pulse');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(PULSE_MS + 1);
      });
      expect(screen.getByTestId('unread-badge')).not.toHaveAttribute('data-pulsing');
    });
  });
});
