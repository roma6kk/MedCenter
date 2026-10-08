import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { NoshowButton } from './noshow-button';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

function renderButton(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<NoshowButton appointmentId="a1" />, { wrapper: Wrapper });
}

describe('NoshowButton', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined as never);
  });

  it('should not call the API until the no-show is confirmed', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Подтверждение неявки' })).toBeInTheDocument();
  });

  it('should POST the no-show for the appointment after confirmation', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить неявку' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/doctor/appointments/a1/noshow', { method: 'POST' }));
  });

  it('should return to the initial state when cancelled', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Неявка' }));
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Неявка' })).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
