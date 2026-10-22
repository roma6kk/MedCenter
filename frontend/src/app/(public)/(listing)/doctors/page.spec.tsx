import { render, screen } from '@testing-library/react';

jest.mock('@/components/catalog/catalog-server', () => ({ loadDoctorPage: jest.fn(), loadDoctors: jest.fn(), loadServices: jest.fn() }));

import { loadDoctorPage, loadDoctors, loadServices } from '@/components/catalog/catalog-server';
import DoctorsPage from './page';

const loadDoctorPageMock = loadDoctorPage as jest.MockedFunction<typeof loadDoctorPage>;
const loadDoctorsMock = loadDoctors as jest.MockedFunction<typeof loadDoctors>;
const loadServicesMock = loadServices as jest.MockedFunction<typeof loadServices>;

const DOCTORS = [
  { id: 'a', firstName: 'Мария', lastName: 'Иванова', name: 'Мария Иванова', specialty: 'Терапевт', specialtyCode: '419192003' },
  { id: 'b', firstName: 'Алексей', lastName: 'Петров', name: 'Алексей Петров', specialty: 'Кардиолог', specialtyCode: '394579002' },
];

function pageOf(items: typeof DOCTORS, page: number = 1, totalPages: number = 1): { ok: true; data: { items: typeof DOCTORS; meta: { page: number; pageSize: number; totalItems: number; totalPages: number } } } {
  return { ok: true, data: { items, meta: { page, pageSize: 9, totalItems: items.length, totalPages } } };
}

async function renderPage(search: Record<string, string | string[]>): Promise<void> {
  render(await DoctorsPage({ searchParams: Promise.resolve(search) }));
}

describe('DoctorsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    loadServicesMock.mockResolvedValue({ ok: true, data: [] });
  });

  it('should ask the API for one page of the chosen service, specialty and name, and every specialty of that service and name', async () => {
    loadDoctorPageMock.mockResolvedValue(pageOf([DOCTORS[1]!]));
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ serviceId: 'svc-1', specialty: '394579002', search: ' Пет ', page: '1' });

    expect(loadDoctorPageMock).toHaveBeenCalledWith({ serviceId: 'svc-1', specialty: '394579002', search: 'Пет', page: 1, pageSize: 9 });
    expect(loadDoctorsMock).toHaveBeenCalledWith({ serviceId: 'svc-1', search: 'Пет' });
    expect(screen.getAllByTestId('doctor-card')).toHaveLength(1);
    expect(screen.getByLabelText('Специальность')).toHaveValue('394579002');
    expect(screen.getByRole('option', { name: 'Терапевт' })).toBeInTheDocument();
  });

  it('should show the last page when the URL asks for a page past the end', async () => {
    loadDoctorPageMock.mockResolvedValueOnce(pageOf([], 5, 2)).mockResolvedValueOnce(pageOf([DOCTORS[0]!], 2, 2));
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ page: '5' });

    expect(loadDoctorPageMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 9 });
    expect(screen.getAllByTestId('doctor-card')).toHaveLength(1);
  });

  it('should not forward a malformed service id or a specialty text to the API when the URL carries them', async () => {
    loadDoctorPageMock.mockResolvedValue(pageOf(DOCTORS));
    loadDoctorsMock.mockResolvedValue({ ok: true, data: DOCTORS });

    await renderPage({ serviceId: '../x,y', specialty: 'Кардиолог' });

    expect(loadDoctorPageMock).toHaveBeenCalledWith({ page: 1, pageSize: 9 });
  });

  it('should still list the doctors without specialty options when the options cannot be read', async () => {
    loadDoctorPageMock.mockResolvedValue(pageOf(DOCTORS));
    loadDoctorsMock.mockResolvedValue({ ok: false });

    await renderPage({});

    expect(screen.getAllByTestId('doctor-card')).toHaveLength(2);
  });

  it('should show the banner with a retry link when the API cannot be reached', async () => {
    loadDoctorPageMock.mockResolvedValue({ ok: false });
    loadDoctorsMock.mockResolvedValue({ ok: false });

    await renderPage({});

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить список врачей');
  });
});
