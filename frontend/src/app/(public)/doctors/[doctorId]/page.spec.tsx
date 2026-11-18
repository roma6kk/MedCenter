import { screen, within } from '@testing-library/react';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  notFound: (): never => {
    throw NOT_FOUND;
  },
}));
jest.mock('@/components/catalog/catalog-server', () => ({ loadDoctor: jest.fn() }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { loadDoctor } from '@/components/catalog/catalog-server';
import { renderWithCatalog, serveCatalog } from '@/components/catalog/catalog-test-utils';
import DoctorProfilePage from './page';

const loadDoctorMock = loadDoctor as jest.MockedFunction<typeof loadDoctor>;

const MARIA = { id: 'a', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт' };

async function renderPage(doctorId: string): Promise<void> {
  renderWithCatalog(await DoctorProfilePage({ params: Promise.resolve({ doctorId }) }));
}

describe('DoctorProfilePage', () => {
  beforeEach(() => {
    loadDoctorMock.mockReset();
    serveCatalog();
  });

  it('should show the doctor and the place to pick a time when the API knows the doctor', async () => {
    loadDoctorMock.mockResolvedValue({ ok: true, data: MARIA });

    await renderPage('a');

    expect(screen.getByRole('heading', { level: 1, name: 'Иванова Мария' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Свободное время' })).toBeInTheDocument();
  });

  it('should describe the doctor with the specialty and the services he gives, and own up that no biography is published', async () => {
    const services = [
      { id: 'svc-1', name: 'Приём терапевта', defaultDurationMin: 30, isActive: true },
      { id: 'svc-2', name: 'Приём кардиолога', defaultDurationMin: 40, isActive: true },
    ];
    serveCatalog({ services, doctorsByService: { 'svc-1': [{ id: 'a' }] } });
    loadDoctorMock.mockResolvedValue({ ok: true, data: MARIA });

    await renderPage('a');

    const about = screen.getByRole('region', { name: 'О враче' });
    const list = await within(about).findByTestId('doctor-services');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('Приём терапевта');
    expect(list).toHaveTextContent('30 мин');
    expect(list).not.toHaveTextContent('Приём кардиолога');
    expect(about).toHaveTextContent('Терапевт');
    expect(about).toHaveTextContent('Стаж, образование и описание врача клиника пока не публикует.');
  });

  it('should say the services are not listed when the doctor gives none', async () => {
    loadDoctorMock.mockResolvedValue({ ok: true, data: { ...MARIA, specialty: undefined } });

    await renderPage('a');

    expect(await screen.findByText('Услуги врача пока не указаны.')).toBeInTheDocument();
  });

  it.each([404, 400])('should answer not found (a real 404) when the API answers %s', async (status) => {
    loadDoctorMock.mockResolvedValue({ ok: false, status });

    await expect(renderPage('nope')).rejects.toBe(NOT_FOUND);
  });

  it('should answer not found without asking the API when the id cannot be an id', async () => {
    await expect(renderPage('..')).rejects.toBe(NOT_FOUND);

    expect(loadDoctorMock).not.toHaveBeenCalled();
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
