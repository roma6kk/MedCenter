import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { NotificationBell } from './notification-bell';

jest.mock('@/lib/notifications/notification-api', () => ({ fetchUnreadCount: jest.fn() }));

import { fetchUnreadCount } from '@/lib/notifications/notification-api';

const unreadMock = fetchUnreadCount as jest.MockedFunction<typeof fetchUnreadCount>;

const SIGNED_OUT = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: true };

function renderBell(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<NotificationBell />, { wrapper: Wrapper });
}

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useUiStore.setState({ locale: 'ru' });
    useSessionStore.setState({ ...SIGNED_OUT, role: 'PATIENT' });
  });

  it('should show the unread count from {count} as a badge and in the accessible name', async () => {
    unreadMock.mockResolvedValue(5);

    renderBell();

    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('5');
    expect(screen.getByRole('link', { name: 'Уведомления, непрочитанных: 5' })).toHaveAttribute('href', '/notifications');
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

    expect(await screen.findByRole('link', { name: 'Notifications, unread: 1' })).toBeInTheDocument();
  });

  it.each([['DOCTOR'], ['ADMIN']] as const)('should render nothing and call no API for a %s', (role) => {
    useSessionStore.setState({ ...SIGNED_OUT, role });

    renderBell();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(unreadMock).not.toHaveBeenCalled();
  });
});
