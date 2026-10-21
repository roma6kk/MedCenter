import { render, screen } from '@testing-library/react';

jest.mock('@/components/catalog/catalog-server', () => ({ loadDoctors: jest.fn(), loadServices: jest.fn() }));

import { loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import DoctorsPage from './page';

const loadDoctorsMock = loadDoctors as jest.MockedFunction<typeof loadDoctors>;
const loadServicesMock = loadServices as jest.MockedFunction<typeof loadServices>;

const DOCTORS = [
  { id: 'a', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт' },
  { id: 'b', firstName: 'Алексей', lastName: 'Петров', name: 'Алексей Петров', specialty: 'Кардиолог' },
];

async function renderPage(search: Record<string, string | string[]>): Promise<void> {
  render(await DoctorsPage({ searchParams: Promise.resolve(search) }));
}

describe('DoctorsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    loadServicesMock.mockResolvedValue({ ok: true, data: [] });
  });

  it('should ask the API for the doctors of the chosen service and name when the URL carries those filters', async () => {
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ serviceId: 'svc-1', search: ' Иван ' });

    expect(loadDoctorsMock).toHaveBeenCalledWith({ serviceId: 'svc-1', search: 'Иван' });
  });

  it('should filter by specialty on the page when the URL names one, because the API takes a code and the doctor shows a text', async () => {
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ specialty: 'Кардиолог' });

    expect(loadDoctorsMock).toHaveBeenCalledWith({});
    expect(screen.getAllByTestId('doctor-card')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Алексей Петров' })).toBeInTheDocument();
  });

  it('should not forward a malformed service id to the API when the URL carries one', async () => {
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ serviceId: '../x,y' });

    expect(loadDoctorsMock).toHaveBeenCalledWith({});
  });

  it('should show the banner with a retry link when the API cannot be reached', async () => {
    loadDoctorsMock.mockResolvedValue({ ok: false });

    await renderPage({});

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить список врачей');
  });
});
