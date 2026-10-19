import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/catalog/catalog-server', () => ({ loadDoctor: jest.fn() }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn().mockResolvedValue({ doctorId: 'a', from: '', to: '', items: [] }) };
});

import { loadDoctor } from '@/components/catalog/catalog-server';
import DoctorProfilePage from './page';

const loadDoctorMock = loadDoctor as jest.MockedFunction<typeof loadDoctor>;

async function renderPage(doctorId: string): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{await DoctorProfilePage({ params: Promise.resolve({ doctorId }) })}</QueryClientProvider>);
}

describe('DoctorProfilePage', () => {
  beforeEach(() => loadDoctorMock.mockReset());

  it('should show the doctor and the place to pick a time when the API knows the doctor', async () => {
    loadDoctorMock.mockResolvedValue({ ok: true, data: { id: 'a', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт' } });

    await renderPage('a');

    expect(screen.getByRole('heading', { level: 1, name: 'Мария Иванова' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Свободное время' })).toBeInTheDocument();
  });

  it.each([404, 400])('should say the doctor was not found when the API answers %s', async (status) => {
    loadDoctorMock.mockResolvedValue({ ok: false, status });

    await renderPage('nope');

    expect(screen.getByTestId('not-found-state')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К списку врачей' })).toHaveAttribute('href', '/doctors');
  });

  it('should show a retryable banner, not "not found", when the API is down', async () => {
    loadDoctorMock.mockResolvedValue({ ok: false, status: 503 });

    await renderPage('a');

    expect(screen.queryByTestId('not-found-state')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/doctors/a');
  });

  it('should show a retryable banner when the API cannot be reached at all', async () => {
    loadDoctorMock.mockResolvedValue({ ok: false });

    await renderPage('a');

    expect(screen.getByTestId('catalog-unavailable')).toBeInTheDocument();
  });
});
