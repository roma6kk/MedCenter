import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { RetentionExpiredSection } from './retention-expired-section';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function renderSection(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<RetentionExpiredSection />, { wrapper: Wrapper });
}

describe('RetentionExpiredSection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should not request anything until the section is opened', () => {
    renderSection();

    expect(screen.getByRole('button', { name: /Срок хранения истёк/ })).toHaveAttribute('aria-expanded', 'false');
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should list closed accounts with the closing and retention dates when it is opened', async () => {
    apiFetchMock.mockResolvedValue({
      items: [{ id: 'u1', name: 'Иванов Иван', closedAt: '2020-01-10T09:00:00.000Z', retentionUntil: '2025-01-09T09:00:00.000Z' }],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Срок хранения истёк/ }));

    expect((await screen.findAllByText('Иванов Иван')).length).toBeGreaterThan(0);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/users/retention-expired?page=1&pageSize=10');
    expect(screen.getAllByText(/10 янв\. 2020/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/9 янв\. 2025/).length).toBeGreaterThan(0);
  });

  it('should say that nothing is due and that nothing is deleted automatically when the list is empty', async () => {
    apiFetchMock.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /Срок хранения истёк/ }));

    expect(await screen.findByText('Закрытых учётных записей с истёкшим сроком хранения нет')).toBeInTheDocument();
    expect(screen.getByText(/автоматически не удаляются/)).toBeInTheDocument();
  });
});
