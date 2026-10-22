import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import { appointmentFixture } from './appointment-fixtures';
import { AppointmentList } from './appointment-list';

jest.mock('./appointment-api', () => ({ cancelAppointment: jest.fn(), fetchAppointments: jest.fn(), fetchAppointment: jest.fn() }));

import { cancelAppointment, fetchAppointments } from './appointment-api';

const listMock = fetchAppointments as jest.MockedFunction<typeof fetchAppointments>;
const cancelMock = cancelAppointment as jest.MockedFunction<typeof cancelAppointment>;

const BOOKED = appointmentFixture({ id: '1', status: 'booked' });
const CANCELLED = appointmentFixture({ id: '2', status: 'cancelled', cancelReason: 'Заболел', start: '2026-10-20T07:00:00.000Z' });

describe('AppointmentList', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should show a loading skeleton while the first page is being read', () => {
    listMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<AppointmentList />);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should request the first page of upcoming appointments, lead with the nearest one and list the rest as cards', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED, CANCELLED]));

    renderWithClient(<AppointmentList />);

    const list = await screen.findByRole('list', { name: 'Записи на приём' });
    expect(within(screen.getByTestId('next-appointment')).getByTestId('stamp-booked')).toBeInTheDocument();
    expect(within(list).getAllByRole('article')).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith({ tab: 'upcoming', page: 1, pageSize: 10 });
  });

  it('should name the page and set the tab title', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED]));

    renderWithClient(<AppointmentList />);

    expect(screen.getByRole('heading', { level: 1, name: 'Мои записи' })).toBeInTheDocument();
    expect(document.title).toBe('Мои записи — МедЦентр');
    await screen.findByTestId('next-appointment');
  });

  it('should invite to book when there are no upcoming appointments', async () => {
    listMock.mockResolvedValue(pageOf([]));

    renderWithClient(<AppointmentList />);

    expect(await screen.findByText('Предстоящих записей нет')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Записаться' })).toHaveAttribute('href', '/booking');
  });

  it('should read the whole history when the all tab is chosen, and start again from page 1', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED]));
    renderWithClient(<AppointmentList />);
    await screen.findByTestId('next-appointment');

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ tab: 'all', page: 1, pageSize: 10 }));
    expect(screen.getByRole('tab', { name: 'Все записи' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should say there are no appointments at all when the history is empty', async () => {
    listMock.mockResolvedValue(pageOf([]));
    renderWithClient(<AppointmentList />);
    await screen.findByText('Предстоящих записей нет');

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    expect(await screen.findByText('Записей нет')).toBeInTheDocument();
  });

  it('should show a banner with the request id and retry the read when the service fails', async () => {
    listMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-9' }));
    listMock.mockResolvedValue(pageOf([BOOKED]));
    renderWithClient(<AppointmentList />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-9');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByTestId('next-appointment')).toBeInTheDocument();
  });

  it('should keep the banner and the focus on the retry button while the failed first read is repeated', async () => {
    listMock.mockRejectedValueOnce(apiProblem(0, 'INTERNAL'));
    listMock.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<AppointmentList />);
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    const retrying = await screen.findByRole('button', { name: 'Повторяем…' });

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
    expect(retrying).toHaveFocus();
  });

  it('should page through the server pages when there is more than one', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED], { page: 1, totalItems: 25 }));
    renderWithClient(<AppointmentList />);
    await screen.findByTestId('next-appointment');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ tab: 'upcoming', page: 2, pageSize: 10 }));
  });

  it('should hide the pager when everything fits on one page', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED]));
    renderWithClient(<AppointmentList />);
    await screen.findByTestId('next-appointment');

    expect(screen.queryByRole('navigation', { name: 'Пагинация' })).not.toBeInTheDocument();
  });

  it('should offer cancellation only on the booked appointment', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED, CANCELLED]));
    renderWithClient(<AppointmentList />);

    await screen.findByRole('list');

    expect(screen.getAllByRole('button', { name: /Отменить запись:/ })).toHaveLength(1);
  });

  it('should cancel with a reason, close the dialog, announce it and read the list again', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED]));
    cancelMock.mockResolvedValue({});
    renderWithClient(<AppointmentList />);
    await userEvent.click(await screen.findByRole('button', { name: /Отменить запись:/ }));

    await userEvent.type(screen.getByLabelText('Причина отмены'), 'Заболел');
    listMock.mockResolvedValue(pageOf([{ ...BOOKED, status: 'cancelled' }]));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отмену' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cancelMock).toHaveBeenCalledWith('1', 'Заболел');
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Запись отменена');
    expect(await screen.findByTestId('stamp-cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Отменить запись:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
  });

  it('should keep the appointment and the focus on its button when the dialog is dismissed', async () => {
    listMock.mockResolvedValue(pageOf([BOOKED]));
    renderWithClient(<AppointmentList />);
    const trigger = await screen.findByRole('button', { name: /Отменить запись:/ });
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('button', { name: 'Не отменять' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('should not show the previous tab as the new one, nor a false empty state, while the other tab is loading', async () => {
    listMock.mockResolvedValueOnce(pageOf([]));
    renderWithClient(<AppointmentList />);
    await screen.findByText('Предстоящих записей нет');
    listMock.mockReturnValue(new Promise(() => undefined));

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    expect(await screen.findByTestId('table-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('Записей нет')).not.toBeInTheDocument();
  });

  it('should not show the cards of the previous tab under the new one while it is loading', async () => {
    listMock.mockResolvedValueOnce(pageOf([BOOKED]));
    renderWithClient(<AppointmentList />);
    await screen.findByTestId('next-appointment');
    listMock.mockReturnValue(new Promise(() => undefined));

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    expect(await screen.findByTestId('table-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('next-appointment')).not.toBeInTheDocument();
  });

  it('should keep the previous page on screen while the next page of the same tab is loading', async () => {
    listMock.mockResolvedValueOnce(pageOf([BOOKED], { page: 1, totalItems: 25 }));
    renderWithClient(<AppointmentList />);
    await screen.findByTestId('next-appointment');
    listMock.mockReturnValue(new Promise(() => undefined));

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ tab: 'upcoming', page: 2, pageSize: 10 }));
    expect(screen.getByTestId('next-appointment')).toBeInTheDocument();
    expect(screen.queryByTestId('table-skeleton')).not.toBeInTheDocument();
  });

  it('should keep the server order with the cancelled ones on the all tab', async () => {
    listMock.mockResolvedValue(pageOf([CANCELLED, BOOKED]));
    renderWithClient(<AppointmentList />);
    await screen.findByRole('list');

    await userEvent.click(screen.getByRole('tab', { name: 'Все записи' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ tab: 'all', page: 1, pageSize: 10 }));
    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).queryByTestId('stamp-cancelled') !== null)).toEqual([true, false]);
  });

  it('should show one heading and a banner with a retry, not a second not-found screen, when the read answers 404', async () => {
    listMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-30' }));

    renderWithClient(<AppointmentList />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-30');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId('not-found-state')).not.toBeInTheDocument();
  });
});
