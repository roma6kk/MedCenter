import { render, screen, within } from '@testing-library/react';
import type { PaginatedResponse } from '@/lib/api/pagination';
import type { CatalogService, Doctor } from './catalog-types';
import { DoctorCatalog } from './doctor-catalog';
import { buildDirectory } from './doctor-directory';

const SERVICES: ReadonlyArray<CatalogService> = [
  { id: 'svc-1', name: 'Приём терапевта', typeSystem: 's', typeCode: '1', defaultDurationMin: 30, isActive: true },
];

const CODES: Readonly<Record<string, string>> = { Терапевт: '419192003', Кардиолог: '394579002' };

function doctor(id: string, specialty?: string): Doctor {
  return { id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, ...(specialty === undefined ? {} : { specialty, specialtyCode: CODES[specialty] }) };
}

/** The API's page of these doctors (9 per page, as the directory asks). */
function pageOf(doctors: ReadonlyArray<Doctor>, page: number = 1): PaginatedResponse<Doctor> {
  const totalPages: number = Math.ceil(doctors.length / 9);
  return { items: doctors.slice((page - 1) * 9, page * 9), meta: { page, pageSize: 9, totalItems: doctors.length, totalPages } };
}

function directoryOf(doctors: ReadonlyArray<Doctor>): ReturnType<typeof buildDirectory> {
  return buildDirectory(pageOf(doctors), doctors);
}

describe('DoctorCatalog', () => {
  it('should list the doctors with a profile link each when the directory has doctors', () => {
    const directory = directoryOf([doctor('a', 'Терапевт'), doctor('b', 'Кардиолог')]);
    render(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Врачи' })).toBeInTheDocument();
    expect(screen.getAllByTestId('doctor-card')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Профиль: Имя a' })).toHaveAttribute('href', '/doctors/a');
    expect(screen.getByText('Найдено врачей: 2')).toBeInTheDocument();
  });

  it('should render the filters as a GET form that keeps the chosen values when filters are chosen', () => {
    const directory = directoryOf([doctor('a', 'Терапевт')]);
    render(<DoctorCatalog params={{ page: 1, serviceId: 'svc-1', specialty: '419192003', search: 'Ив' }} services={SERVICES} directory={directory} />);

    const form = screen.getByRole('search', { name: 'Фильтр врачей' });
    expect(form).toHaveAttribute('method', 'get');
    expect(within(form).getByLabelText('Услуга')).toHaveValue('svc-1');
    expect(within(form).getByLabelText('Специальность')).toHaveValue('419192003');
    expect(within(form).getByRole('option', { name: 'Терапевт' })).toHaveValue('419192003');
    expect(within(form).getByLabelText('Имя или фамилия')).toHaveValue('Ив');
  });

  it('should offer a way to reset the filters when no doctor matches', () => {
    const directory = directoryOf([doctor('a')]);
    render(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(screen.getByRole('link', { name: 'Сбросить' })).toHaveAttribute('href', '/doctors');
  });

  it('should say no doctor was found and offer to reset when the filters match nobody', () => {
    const directory = directoryOf([]);
    render(<DoctorCatalog params={{ page: 1, search: 'Яяя' }} services={SERVICES} directory={directory} />);

    expect(screen.getByText('Врачи не найдены')).toBeInTheDocument();
    expect(screen.getByText('Измените фильтры поиска.')).toBeInTheDocument();
  });

  it('should show the real cause banner with a retry link when the doctors could not be loaded', () => {
    render(<DoctorCatalog params={{ page: 1, search: 'Ив' }} services={SERVICES} directory={null} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить список врачей');
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/doctors?search=%D0%98%D0%B2');
  });

  it('should page through the doctors with links that keep the filters when there is more than one page', () => {
    const many = Array.from({ length: 12 }, (_, index) => doctor(`d${index}`, 'Терапевт'));
    const params = { page: 1, specialty: '419192003' };
    render(<DoctorCatalog params={params} services={SERVICES} directory={directoryOf(many)} />);

    const pager = screen.getByRole('navigation', { name: 'Страницы каталога врачей' });
    expect(within(pager).getByRole('link', { name: 'Следующая страница' })).toHaveAttribute('href', '/doctors?specialty=419192003&page=2');
    expect(within(pager).getByText('Предыдущая страница')).toHaveAttribute('aria-disabled', 'true');
  });

  it('should not show a pager when there is a single page', () => {
    render(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    expect(screen.queryByRole('navigation', { name: 'Страницы каталога врачей' })).not.toBeInTheDocument();
  });

  it('should drop the service filter when the catalog of services is unavailable', () => {
    render(<DoctorCatalog params={{ page: 1 }} services={[]} directory={directoryOf([doctor('a')])} />);

    expect(screen.queryByLabelText('Услуга')).not.toBeInTheDocument();
  });
});
