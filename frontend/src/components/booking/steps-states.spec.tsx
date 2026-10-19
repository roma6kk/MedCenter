import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { ApiError, apiFetch } from '@/lib/api/api-fetch';
import { DoctorStep } from './doctor-step';
import { ServiceStep } from './service-step';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;
const META = { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 };

function renderWithClient(ui: ReactNode): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ServiceStep states', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should still offer "any service" when the clinic has no services in its catalog', async () => {
    apiFetchMock.mockResolvedValue({ items: [], meta: META });
    renderWithClient(<ServiceStep selectedServiceId={null} onSelect={jest.fn()} />);

    expect(await screen.findByText('Каталог услуг пока пуст')).toBeInTheDocument();
    expect(screen.getByTestId('service-any')).toBeInTheDocument();
  });

  it('should let the visitor choose "any service" with a null id when its card is clicked', async () => {
    apiFetchMock.mockResolvedValue({ items: [], meta: META });
    const onSelect = jest.fn();
    renderWithClient(<ServiceStep selectedServiceId={null} onSelect={onSelect} />);

    await userEvent.click(await screen.findByTestId('service-any'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('should show the real problem and a retry button when the catalog cannot be read', async () => {
    apiFetchMock.mockRejectedValue(new ApiError({ title: 'x', status: 503, errorCode: 'INTERNAL', requestId: 'req-3' }));
    renderWithClient(<ServiceStep selectedServiceId={null} onSelect={jest.fn()} />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-3');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});

describe('DoctorStep states', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should say that no doctor gives the chosen service and point back one step when the doctor list is empty', async () => {
    apiFetchMock.mockResolvedValue({ items: [], meta: META });
    renderWithClient(<DoctorStep serviceId={null} selectedDoctorId={null} onSelect={jest.fn()} />);

    expect(await screen.findByText('Для выбранной услуги нет врачей')).toBeInTheDocument();
    expect(screen.getByText('Вернитесь на шаг назад и выберите другую услугу.')).toBeInTheDocument();
  });

  it('should show the real problem when the doctors cannot be read', async () => {
    apiFetchMock.mockRejectedValue(new ApiError({ title: 'x', status: 500, errorCode: 'INTERNAL', requestId: 'req-5' }));
    renderWithClient(<DoctorStep serviceId={null} selectedDoctorId={null} onSelect={jest.fn()} />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-5');
  });
});
