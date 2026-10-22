import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import { appointmentFixture } from './appointment-fixtures';
import { AppointmentDetailView } from './appointment-detail-view';

jest.mock('./appointment-api', () => ({ cancelAppointment: jest.fn(), fetchAppointments: jest.fn(), fetchAppointment: jest.fn() }));

import { cancelAppointment, fetchAppointment } from './appointment-api';

const detailMock = fetchAppointment as jest.MockedFunction<typeof fetchAppointment>;
const cancelMock = cancelAppointment as jest.MockedFunction<typeof cancelAppointment>;

describe('AppointmentDetailView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should read the appointment by the id of the address and show all its fields', async () => {
    detailMock.mockResolvedValue(appointmentFixture({ reason: 'Болит спина' }));

    renderWithClient(<AppointmentDetailView appointmentId="1552" />);

    expect(await screen.findByText('Болит спина')).toBeInTheDocument();
    expect(detailMock).toHaveBeenCalledWith('1552');
    expect(screen.getByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();
    expect(screen.getByText('Иванова Мария Сергеевна')).toBeInTheDocument();
    expect(screen.getByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText(/10:30/)).toBeInTheDocument();
    expect(screen.getByTestId('stamp-booked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /К списку записей/ })).toHaveAttribute('href', '/appointments');
  });

  it('should show when the appointment was created in Minsk time, and only the day for an older one', async () => {
    detailMock.mockResolvedValueOnce(appointmentFixture({ createdAt: '2026-10-22T07:07:58.285Z' }));
    const { unmount } = renderWithClient(<AppointmentDetailView appointmentId="1552" />);

    const created = await screen.findByText('Создана');
    expect(created.parentElement).toHaveTextContent(/10:07/);
    unmount();

    detailMock.mockResolvedValueOnce(appointmentFixture({ createdAt: '2026-10-15' }));
    renderWithClient(<AppointmentDetailView appointmentId="1553" />);
    const day = await screen.findByText('Создана');
    expect(day.parentElement).toHaveTextContent(/15 октября 2026/);
    expect(day.parentElement).not.toHaveTextContent(/\d{2}:\d{2}/);
  });

  it('should show a loading skeleton while the appointment is being read', () => {
    detailMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<AppointmentDetailView appointmentId="1552" />);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it.each([
    ['404 NOT_FOUND', apiProblem(404, 'NOT_FOUND')],
    ['403 COMPARTMENT_VIOLATION of another patient', apiProblem(403, 'COMPARTMENT_VIOLATION')],
    ['400 for a malformed id', apiProblem(400, 'VALIDATION_ERROR')],
  ])('should show the not-found state as the whole page with one way back when the service answers %s', async (_name, error) => {
    detailMock.mockRejectedValue(error);

    renderWithClient(<AppointmentDetailView appointmentId="nope" />);

    expect(await screen.findByTestId('not-found-state')).toHaveTextContent('Запись не найдена');
    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Запись недоступна или была удалена.');
    expect(screen.queryByTestId('forbidden-state')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /К списку записей/ })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('should show a banner with the request id when the service fails', async () => {
    detailMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-3' }));

    renderWithClient(<AppointmentDetailView appointmentId="1552" />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-3');
  });

  it('should show why a cancelled appointment was cancelled and offer no cancel button', async () => {
    detailMock.mockResolvedValue(appointmentFixture({ status: 'cancelled', cancelReason: 'Заболел' }));

    renderWithClient(<AppointmentDetailView appointmentId="1552" />);

    expect(await screen.findByText('Заболел')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отменить запись' })).not.toBeInTheDocument();
  });

  it('should cancel with a reason, refresh the record and move the focus to the heading', async () => {
    detailMock.mockResolvedValue(appointmentFixture());
    cancelMock.mockResolvedValue({});
    renderWithClient(<AppointmentDetailView appointmentId="1552" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Отменить запись' }));

    await userEvent.type(screen.getByLabelText('Причина отмены'), 'Заболел');
    detailMock.mockResolvedValue(appointmentFixture({ status: 'cancelled', cancelReason: 'Заболел' }));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отмену' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cancelMock).toHaveBeenCalledWith('1552', 'Заболел');
    expect(await screen.findByTestId('stamp-cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отменить запись' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Запись отменена');
  });
});
