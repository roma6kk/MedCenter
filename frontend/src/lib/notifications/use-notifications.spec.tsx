import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/api/query-keys';
import { useSessionStore } from '@/store/use-session-store';
import { useMarkNotificationRead, useNotifications, useUnreadCount } from './use-notifications';

jest.mock('./notification-api', () => ({
  fetchUnreadCount: jest.fn(),
  fetchNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
}));

import { fetchNotifications, fetchUnreadCount, markNotificationRead } from './notification-api';

const unreadMock = fetchUnreadCount as jest.MockedFunction<typeof fetchUnreadCount>;
const listMock = fetchNotifications as jest.MockedFunction<typeof fetchNotifications>;
const readMock = markNotificationRead as jest.MockedFunction<typeof markNotificationRead>;

const SIGNED_OUT = { accessToken: null, expiresAt: null, role: null, scope: null, patientRef: null, fhirUser: null, hydrated: false };

function setSession(role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | null, hydrated = true): void {
  useSessionStore.setState({ ...SIGNED_OUT, role, hydrated });
}

function createWrapper(client: QueryClient): (props: { readonly children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useUnreadCount', () => {
  let client: QueryClient;

  beforeEach(() => {
    jest.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setSession('PATIENT');
  });

  it('should fetch the unread counter for a patient', async () => {
    unreadMock.mockResolvedValue(7);

    const { result } = renderHook(() => useUnreadCount(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.data).toBe(7));
  });

  it('should poll every 30 seconds without polling in a background tab (ADR-015)', async () => {
    unreadMock.mockResolvedValue(1);
    renderHook(() => useUnreadCount(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(unreadMock).toHaveBeenCalled());

    const options = client.getQueryCache().find({ queryKey: queryKeys.unreadCount })?.observers[0]?.options;

    expect(options?.refetchInterval).toBe(30_000);
    expect(options?.refetchIntervalInBackground).toBe(false);
  });

  it.each([['DOCTOR'], ['ADMIN']] as const)('should never call the API for a %s because they have no notifications', async (role) => {
    setSession(role);

    renderHook(() => useUnreadCount(), { wrapper: createWrapper(client) });
    await act(async () => {
      await Promise.resolve();
    });

    expect(unreadMock).not.toHaveBeenCalled();
  });

  it('should wait for the session to be hydrated before asking', async () => {
    setSession('PATIENT', false);

    renderHook(() => useUnreadCount(), { wrapper: createWrapper(client) });
    await act(async () => {
      await Promise.resolve();
    });

    expect(unreadMock).not.toHaveBeenCalled();
  });
});

describe('useNotifications', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setSession('PATIENT');
  });

  it('should list the notifications of the requested page', async () => {
    const page = { items: [{ id: 'n1', category: 'appointment', text: 'Вы записаны', sent: '2026-10-16T08:00:00Z', read: false }], meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
    listMock.mockResolvedValue(page);

    const { result } = renderHook(() => useNotifications({ page: 1 }), { wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })) });

    await waitFor(() => expect(result.current.data).toEqual(page));
    expect(listMock).toHaveBeenCalledWith({ page: 1 });
  });
});

describe('useMarkNotificationRead', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setSession('PATIENT');
  });

  it('should refresh the list and the unread counter after a notification is marked read', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.notifications(), { items: [] });
    client.setQueryData(queryKeys.unreadCount, 3);
    readMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.mutateAsync('n1');
    });

    expect(readMock).toHaveBeenCalledWith('n1');
    expect(client.getQueryState(queryKeys.notifications())?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.unreadCount)?.isInvalidated).toBe(true);
  });
});
