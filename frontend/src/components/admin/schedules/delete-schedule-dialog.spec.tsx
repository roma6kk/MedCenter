import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { DeleteScheduleDialog } from './delete-schedule-dialog';
import type { AdminSchedule } from './schedule-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;
const schedule: AdminSchedule = { id: '2572', isActive: true, windows: [] };

function renderDialog(onClose: () => void = jest.fn()): void {
  renderWithClient(<DeleteScheduleDialog schedule={schedule} scheduleLabel="Козлов Дмитрий · Кабинет 101" onClose={onClose} />);
}

describe('DeleteScheduleDialog', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should delete without the cascade by default and close when the schedule had no slots', async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const onClose = jest.fn();
    renderDialog(onClose);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572', { method: 'DELETE', body: JSON.stringify({ cascade: false }) });
  });

  it('should send cascade true when «Удалить также свободные слоты» is ticked', async () => {
    apiFetchMock.mockResolvedValue(undefined);
    renderDialog();

    await userEvent.click(screen.getByRole('checkbox', { name: /Удалить также свободные слоты/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/schedules/2572', { method: 'DELETE', body: JSON.stringify({ cascade: true }) }));
  });

  it('should keep the dialog open and explain SCHEDULE_IN_USE when slots protect the schedule', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'SCHEDULE_IN_USE', detail: 'SCHEDULE_IN_USE: schedule 2572 has slots' }));
    const onClose = jest.fn();
    renderDialog(onClose);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    const dialog = screen.getByRole('dialog', { name: 'Удаление расписания' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Слоты с записями защищают его всегда');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should name the schedule being deleted in the question when the dialog opens', () => {
    renderDialog();

    expect(screen.getByText('Удалить расписание «Козлов Дмитрий · Кабинет 101»?')).toBeInTheDocument();
  });

  it('should put the focus on «Отмена» and not on the option when the dialog opens, so that Enter does not delete anything', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus();
  });
});
