import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, pageOf, renderWithClient } from '../shared/test-utils';
import type { AdminService } from './service-types';
import { ServicesPanel } from './services-panel';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const services: ReadonlyArray<AdminService> = [
  { id: 's1', name: 'Приём терапевта', typeSystem: 'https://fhir.by/CodeSystem/nsi-services', typeCode: '10001', typeDisplay: 'Приём первичный', defaultDurationMin: 30, isActive: true },
];

async function first(name: string): Promise<HTMLElement> {
  return (await screen.findAllByRole('button', { name }))[0] as HTMLElement;
}

describe('ServicesPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(pageOf(services));
  });

  it('should list the services from the public catalogue GET /api/v1/services when the panel mounts', async () => {
    renderWithClient(<ServicesPanel />);

    expect((await screen.findAllByText('Приём терапевта')).length).toBeGreaterThan(0);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/services?page=1&pageSize=10');
  });

  it('should request the search text and the first page when the search is submitted', async () => {
    renderWithClient(<ServicesPanel />);
    await screen.findAllByText('Приём терапевта');

    await userEvent.type(screen.getByLabelText('Поиск по названию'), 'экг{Enter}');

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/services?page=1&pageSize=10&search=%D1%8D%D0%BA%D0%B3'));
  });

  it('should explain SERVICE_IN_USE in the delete dialog when schedules still use the service', async () => {
    apiFetchMock.mockImplementation((_path, options) =>
      options?.method === 'DELETE'
        ? Promise.reject(apiProblem({ status: 409, errorCode: 'SERVICE_IN_USE', detail: 'SERVICE_IN_USE: service s1 is referenced by a schedule' }))
        : Promise.resolve(pageOf(services)),
    );
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await first('Удалить услугу Приём терапевта'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Услуга используется в расписаниях или записях');
  });

  it('should show TERMINOLOGY_NOT_FOUND at the code field and focus it when the code is not in the catalogue', async () => {
    apiFetchMock.mockImplementation((_path, options) =>
      options?.method === 'POST'
        ? Promise.reject(apiProblem({ status: 422, errorCode: 'TERMINOLOGY_NOT_FOUND', detail: 'code 99999 is not in the seeded value set' }))
        : Promise.resolve(pageOf(services)),
    );
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await first('Создать услугу'));

    await userEvent.type(screen.getByLabelText(/Название/), 'Новая');
    await userEvent.type(screen.getByLabelText(/Код услуги НСИ/), '99999');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать услугу' }));

    expect(await screen.findByText('Такого кода нет в справочнике НСИ')).toBeInTheDocument();
    expect(screen.getByLabelText(/Код услуги НСИ/)).toHaveFocus();
  });

  it('should patch the service with the new duration when it is edited', async () => {
    apiFetchMock.mockImplementation((_path, options) => (options?.method === 'PATCH' ? Promise.resolve(services[0]) : Promise.resolve(pageOf(services))));
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await first('Изменить услугу Приём терапевта'));

    await userEvent.clear(screen.getByLabelText(/Длительность/));
    await userEvent.type(screen.getByLabelText(/Длительность/), '45');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/services/s1', expect.objectContaining({ method: 'PATCH' })));
    const patch = apiFetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ defaultDurationMin: 45, name: 'Приём терапевта' });
  });

  it('should step back to the last page that has services when the only service of the last page is deleted', async () => {
    let isDeleted = false;
    const meta = (page: number, totalPages: number): { page: number; pageSize: number; totalItems: number; totalPages: number } => ({ page, pageSize: 10, totalItems: 11, totalPages });
    apiFetchMock.mockImplementation((path, options) => {
      if (options?.method === 'DELETE') {
        isDeleted = true;
        return Promise.resolve(undefined);
      }
      if (path === '/api/v1/services?page=2&pageSize=10') return Promise.resolve({ items: isDeleted ? [] : [{ ...services[0], id: 's2', name: 'Приём хирурга' }], meta: meta(2, isDeleted ? 1 : 2) });
      return Promise.resolve({ items: services, meta: meta(1, isDeleted ? 1 : 2) });
    });
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Следующая страница' }));
    await userEvent.click(await first('Удалить услугу Приём хирурга'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v1/services?page=1&pageSize=10'));
    expect((await screen.findAllByText('Приём терапевта')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('should not offer the specialty codes the server would drop when a service is created', async () => {
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await first('Создать услугу'));

    expect(screen.queryByLabelText(/Коды специальностей/)).not.toBeInTheDocument();
  });

  it('should not announce the old failure again when the code is edited after TERMINOLOGY_NOT_FOUND', async () => {
    apiFetchMock.mockImplementation((_path, options) =>
      options?.method === 'POST'
        ? Promise.reject(apiProblem({ status: 422, errorCode: 'TERMINOLOGY_NOT_FOUND', detail: 'code 99999 is not in the seeded value set' }))
        : Promise.resolve(pageOf(services)),
    );
    renderWithClient(<ServicesPanel />);
    await userEvent.click(await first('Создать услугу'));
    await userEvent.type(screen.getByLabelText(/Название/), 'Новая');
    await userEvent.type(screen.getByLabelText(/Код услуги НСИ/), '99999');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать услугу' }));
    await screen.findByText('Такого кода нет в справочнике НСИ');

    await userEvent.type(screen.getByLabelText(/Код услуги НСИ/), '1');

    expect(screen.queryByText('Такого кода нет в справочнике НСИ')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
