import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { RoomUsageDrawer } from './room-usage-drawer';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

function renderDrawer(onClose: () => void = jest.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<RoomUsageDrawer roomId="r1" onClose={onClose} />, { wrapper: Wrapper });
}

describe('RoomUsageDrawer', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should list the schedules and slots that occupy the room when the drawer opens', async () => {
    apiFetchMock.mockResolvedValue({
      items: [{ resourceType: 'Schedule', id: 's1', display: 'Пн 09:00–13:00' }],
    });
    renderDrawer();

    expect(await screen.findByText('Пн 09:00–13:00')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/rooms/r1/usage');
  });

  it('should show the free-room state when nothing references the room', async () => {
    apiFetchMock.mockResolvedValue({ items: [] });
    renderDrawer();

    expect(await screen.findByTestId('empty-state')).toBeInTheDocument();
  });

  it('should be a labelled modal dialog when it is shown', async () => {
    apiFetchMock.mockResolvedValue({ items: [] });
    renderDrawer();

    expect(screen.getByRole('dialog', { name: 'Занятость кабинета' })).toBeInTheDocument();
  });

  it('should name the kind of each occupying resource in the language of the interface when the list is shown', async () => {
    apiFetchMock.mockResolvedValue({
      items: [
        { resourceType: 'Schedule', id: 's1', display: 'Пн 09:00–13:00' },
        { resourceType: 'Slot', id: 'sl1', display: '22.10 09:00' },
      ],
    });
    renderDrawer();

    await screen.findByText('Пн 09:00–13:00');

    expect(screen.getByText('Расписание')).toBeInTheDocument();
    expect(screen.getByText('Слот')).toBeInTheDocument();
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
  });
});
