import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock, push: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { useSessionStore } from '@/store/use-session-store';
import type { PaginatedResponse } from '@/lib/api/pagination';
import type { CatalogService, Doctor } from './catalog-types';
import { LATER_SLOT, SLOT, renderWithCatalog, serveCatalog } from './catalog-test-utils';
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
  beforeEach(() => {
    replaceMock.mockReset();
    serveCatalog();
    useSessionStore.getState().clearSession();
  });

  it('should list the doctors with a profile link each when the directory has doctors', () => {
    const directory = directoryOf([doctor('a', 'Терапевт'), doctor('b', 'Кардиолог')]);
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Врачи' })).toBeInTheDocument();
    expect(screen.getAllByTestId('doctor-card')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Профиль: a Имя' })).toHaveAttribute('href', '/doctors/a');
    expect(screen.getByText('Найдено врачей: 2')).toBeInTheDocument();
  });

  it('should render the filters as a GET form that keeps the chosen values when filters are chosen', () => {
    const directory = directoryOf([doctor('a', 'Терапевт')]);
    renderWithCatalog(<DoctorCatalog params={{ page: 1, serviceId: 'svc-1', specialty: '419192003', search: 'Ив' }} services={SERVICES} directory={directory} />);

    const form = screen.getByRole('search', { name: 'Фильтр врачей' });
    expect(form).toHaveAttribute('method', 'get');
    expect(within(form).getByLabelText('Услуга')).toHaveValue('svc-1');
    expect(within(form).getByLabelText('Специальность')).toHaveValue('419192003');
    expect(within(form).getByRole('option', { name: 'Терапевт' })).toHaveValue('419192003');
    expect(within(form).getByLabelText('Имя или фамилия')).toHaveValue('Ив');
  });

  it('should offer a way to reset the filters only when a filter is set', () => {
    const directory = directoryOf([doctor('a')]);
    const { unmount } = renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(screen.queryByRole('link', { name: 'Сбросить' })).not.toBeInTheDocument();
    unmount();
    renderWithCatalog(<DoctorCatalog params={{ page: 1, search: 'Ив' }} services={SERVICES} directory={directory} />);

    expect(screen.getByRole('link', { name: 'Сбросить' })).toHaveAttribute('href', '/doctors');
  });

  it('should have no search button, as the filters apply at once', () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    expect(within(screen.getByRole('search', { name: 'Фильтр врачей' })).queryByRole('button')).not.toBeInTheDocument();
  });

  it('should apply a chosen specialty at once, from the first page, without a history entry', async () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 2, search: 'Ив' }} services={SERVICES} directory={directoryOf([doctor('a', 'Терапевт'), doctor('b', 'Кардиолог')])} />);

    await userEvent.selectOptions(screen.getByLabelText('Специальность'), '394579002');

    expect(replaceMock).toHaveBeenCalledWith('/doctors?specialty=394579002&search=%D0%98%D0%B2', { scroll: false });
  });

  it('should apply a chosen service at once and drop it when "any service" is chosen', async () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1, serviceId: 'svc-1' }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    await userEvent.selectOptions(screen.getByLabelText('Услуга'), '');

    expect(replaceMock).toHaveBeenCalledWith('/doctors', { scroll: false });
  });

  it('should apply the typed name 300 ms after the last keystroke, not on each one', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    await user.type(screen.getByLabelText('Имя или фамилия'), 'Пет');
    expect(replaceMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(299);
    expect(replaceMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/doctors?search=%D0%9F%D0%B5%D1%82', { scroll: false });
    jest.useRealTimers();
  });

  it('should keep a character typed while the page for the previous term is still loading', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const directory = directoryOf([doctor('a')]);
    const view = renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);
    const field = screen.getByLabelText('Имя или фамилия');

    await user.type(field, 'иван');
    act(() => { jest.advanceTimersByTime(300); });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    await user.type(field, 'о');
    // The server answers the first request: the address now carries «иван» while the field already says «ивано».
    view.rerender(<DoctorCatalog params={{ page: 1, search: 'иван' }} services={SERVICES} directory={directory} />);
    act(() => { jest.advanceTimersByTime(300); });

    expect(field).toHaveValue('ивано');
    expect(replaceMock).toHaveBeenCalledTimes(2);
    expect(replaceMock).toHaveBeenLastCalledWith(`/doctors?search=${encodeURIComponent('ивано')}`, { scroll: false });
    jest.useRealTimers();
  });

  it('should follow a change of the address from outside, such as the reset link, and not push it back', () => {
    const directory = directoryOf([doctor('a')]);
    const view = renderWithCatalog(<DoctorCatalog params={{ page: 1, search: 'Ив' }} services={SERVICES} directory={directory} />);
    const field = screen.getByLabelText('Имя или фамилия');
    expect(field).toHaveValue('Ив');

    view.rerender(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(field).toHaveValue('');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('should follow the address again after the field pushed its own term and the visitor then went back', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const directory = directoryOf([doctor('a')]);
    const view = renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);
    const field = screen.getByLabelText('Имя или фамилия');

    await user.type(field, 'иван');
    act(() => { jest.advanceTimersByTime(300); });
    view.rerender(<DoctorCatalog params={{ page: 1, search: 'иван' }} services={SERVICES} directory={directory} />);
    expect(field).toHaveValue('иван');
    // Back: the address returns to a page without the term.
    view.rerender(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directory} />);

    expect(field).toHaveValue('');
    jest.useRealTimers();
  });

  it('should show the nearest free time and a booking link on each card when the doctor has free slots', async () => {
    serveCatalog({ slots: { a: [LATER_SLOT, SLOT] } });
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a', 'Терапевт')])} />);

    expect(await screen.findByText(/Ближайшее: завтра, 11:00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Записаться: a Имя' })).toHaveAttribute('href', '/booking?doctorId=a');
    expect(screen.getByRole('link', { name: 'Профиль: a Имя' })).toHaveAttribute('href', '/doctors/a');
  });

  it('should say there is no free time when the doctor has none in the next two weeks', async () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a', 'Терапевт')])} />);

    expect(await screen.findByText('В ближайшие две недели свободного времени нет')).toBeInTheDocument();
  });

  it('should not offer to book when a doctor looks at the catalog', async () => {
    useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role: 'DOCTOR', scope: null, patientRef: null, fhirUser: null });
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    await screen.findByText('В ближайшие две недели свободного времени нет');
    expect(screen.queryByRole('link', { name: /^Записаться/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль: a Имя' })).toBeInTheDocument();
  });

  it('should say no doctor was found and offer to reset when the filters match nobody', () => {
    const directory = directoryOf([]);
    renderWithCatalog(<DoctorCatalog params={{ page: 1, search: 'Яяя' }} services={SERVICES} directory={directory} />);

    expect(screen.getByText('Врачи не найдены')).toBeInTheDocument();
    expect(screen.getByText('Измените фильтры поиска.')).toBeInTheDocument();
  });

  it('should say the catalogue is empty and not ask to change the filters when no filter is set and there are no doctors at all', () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([])} />);

    expect(screen.getByText('Каталог врачей пока пуст')).toBeInTheDocument();
    expect(screen.queryByText('Измените фильтры поиска.')).not.toBeInTheDocument();
  });

  it('should show the real cause banner with a retry link when the doctors could not be loaded', () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1, search: 'Ив' }} services={SERVICES} directory={null} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить список врачей');
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/doctors?search=%D0%98%D0%B2');
  });

  it('should page through the doctors with links that keep the filters when there is more than one page', () => {
    const many = Array.from({ length: 12 }, (_, index) => doctor(`d${index}`, 'Терапевт'));
    const params = { page: 1, specialty: '419192003' };
    renderWithCatalog(<DoctorCatalog params={params} services={SERVICES} directory={directoryOf(many)} />);

    const pager = screen.getByRole('navigation', { name: 'Страницы каталога врачей' });
    expect(within(pager).getByRole('link', { name: 'Следующая страница' })).toHaveAttribute('href', '/doctors?specialty=419192003&page=2');
    expect(within(pager).getByText('Предыдущая страница')).toHaveAttribute('aria-disabled', 'true');
  });

  it('should not show a pager when there is a single page', () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={SERVICES} directory={directoryOf([doctor('a')])} />);

    expect(screen.queryByRole('navigation', { name: 'Страницы каталога врачей' })).not.toBeInTheDocument();
  });

  it('should drop the service filter when the catalog of services is unavailable', () => {
    renderWithCatalog(<DoctorCatalog params={{ page: 1 }} services={[]} directory={directoryOf([doctor('a')])} />);

    expect(screen.queryByLabelText('Услуга')).not.toBeInTheDocument();
  });
});
