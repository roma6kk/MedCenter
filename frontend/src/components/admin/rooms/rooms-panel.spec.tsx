import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, pageOf, renderWithClient } from '../shared/test-utils';
import type { AdminRoom } from './room-types';
import { RoomsPanel } from './rooms-panel';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const rooms: ReadonlyArray<AdminRoom> = [
  { id: 'r1', identifier: '101', name: 'Кабинет 101', floor: 1, description: 'Терапевт', isActive: true },
  { id: 'r2', identifier: '204', name: 'Кабинет 204', floor: 2, isActive: true },
];

async function first(name: string): Promise<HTMLElement> {
  return (await screen.findAllByRole('button', { name }))[0] as HTMLElement;
}

describe('RoomsPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(pageOf(rooms));
  });

  it('should list the rooms from GET /api/v1/rooms with the page size when the panel mounts', async () => {
    renderWithClient(<RoomsPanel />);

    expect((await screen.findAllByText('Кабинет 101')).length).toBeGreaterThan(0);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/rooms?page=1&pageSize=10');
  });

  it('should accept a bare array when a service has no envelope yet', async () => {
    apiFetchMock.mockResolvedValue(rooms);
    renderWithClient(<RoomsPanel />);

    expect((await screen.findAllByText('Кабинет 204')).length).toBeGreaterThan(0);
  });

  it('should keep the delete dialog open and explain ROOM_IN_USE when a schedule still uses the room', async () => {
    apiFetchMock.mockImplementation((_path, options) =>
      options?.method === 'DELETE'
        ? Promise.reject(apiProblem({ status: 409, errorCode: 'ROOM_IN_USE', detail: 'ROOM_IN_USE: room r1 is referenced by a schedule' }))
        : Promise.resolve(pageOf(rooms)),
    );
    renderWithClient(<RoomsPanel />);
    await userEvent.click(await first('Удалить кабинет Кабинет 101'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    expect(await within(screen.getByRole('dialog', { name: 'Удаление кабинета' })).findByRole('alert')).toHaveTextContent('Кабинет используется в расписаниях');
  });

  it('should close the dialog and call DELETE for the room when nothing uses it', async () => {
    apiFetchMock.mockImplementation((_path, options) => (options?.method === 'DELETE' ? Promise.resolve(undefined) : Promise.resolve(pageOf(rooms))));
    renderWithClient(<RoomsPanel />);
    await userEvent.click(await first('Удалить кабинет Кабинет 204'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/rooms/r2', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('should open the occupancy drawer of the room when «Занятость» is pressed', async () => {
    apiFetchMock.mockImplementation((path) =>
      path.includes('/usage') ? Promise.resolve({ roomId: 'r1', inUse: true, items: [{ resourceType: 'Schedule', id: 's1', display: 'Иванова · 16.10.2026', isActive: true }] }) : Promise.resolve(pageOf(rooms)),
    );
    renderWithClient(<RoomsPanel />);

    await userEvent.click(await first('Занятость кабинета Кабинет 101'));

    expect(await screen.findByText('Иванова · 16.10.2026')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/rooms/r1/usage');
  });

  it('should post a new room without the empty optional fields when the form is valid', async () => {
    apiFetchMock.mockImplementation((_path, options) => (options?.method === 'POST' ? Promise.resolve(rooms[0]) : Promise.resolve(pageOf(rooms))));
    renderWithClient(<RoomsPanel />);
    await userEvent.click(await first('Создать кабинет'));

    await userEvent.type(screen.getByLabelText(/Идентификатор/), 'E2E-9');
    await userEvent.type(screen.getByLabelText(/Название/), 'Тестовый');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать кабинет' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/rooms', { method: 'POST', body: JSON.stringify({ identifier: 'E2E-9', name: 'Тестовый' }) }));
  });

  it('should put a taken identifier at the identifier field in Russian, not in a banner, when the service answers 409 CONFLICT', async () => {
    const taken = apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'CONFLICT: room identifier "101" is already used by room r1' });
    apiFetchMock.mockImplementation((_path, options) => (options?.method === 'POST' ? Promise.reject(taken) : Promise.resolve(pageOf(rooms))));
    renderWithClient(<RoomsPanel />);
    await userEvent.click(await first('Создать кабинет'));

    await userEvent.type(screen.getByLabelText(/Идентификатор/), '101');
    await userEvent.type(screen.getByLabelText(/Название/), 'Дубль');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать кабинет' }));

    expect(await screen.findByText('Кабинет с таким идентификатором уже есть')).toBeInTheDocument();
    expect(screen.getByLabelText(/Идентификатор/)).toHaveFocus();
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
    expect(screen.queryByText(/already used/)).not.toBeInTheDocument();
  });

  it('should step back to the last page that has rooms when the only room of the last page is deleted', async () => {
    let isDeleted = false;
    const meta = (page: number, totalPages: number): { page: number; pageSize: number; totalItems: number; totalPages: number } => ({ page, pageSize: 10, totalItems: 11, totalPages });
    apiFetchMock.mockImplementation((path, options) => {
      if (options?.method === 'DELETE') {
        isDeleted = true;
        return Promise.resolve(undefined);
      }
      if (path === '/api/v1/rooms?page=2&pageSize=10') return Promise.resolve({ items: isDeleted ? [] : [rooms[1]], meta: meta(2, isDeleted ? 1 : 2) });
      return Promise.resolve({ items: [rooms[0]], meta: meta(1, isDeleted ? 1 : 2) });
    });
    renderWithClient(<RoomsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Следующая страница' }));
    await userEvent.click(await first('Удалить кабинет Кабинет 204'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(screen.getAllByText('Кабинет 101').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/v1/rooms?page=1&pageSize=10');
  });
});
