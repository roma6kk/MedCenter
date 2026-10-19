import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import { appointmentFixture } from './appointment-fixtures';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';

jest.mock('./appointment-api', () => ({ cancelAppointment: jest.fn(), fetchAppointments: jest.fn(), fetchAppointment: jest.fn() }));

import { cancelAppointment } from './appointment-api';

const cancelMock = cancelAppointment as jest.MockedFunction<typeof cancelAppointment>;

function renderDialog(): { onClose: jest.Mock; onCancelled: jest.Mock } {
  const onClose = jest.fn();
  const onCancelled = jest.fn();
  renderWithClient(<CancelAppointmentDialog appointment={appointmentFixture()} onClose={onClose} onCancelled={onCancelled} />);
  return { onClose, onCancelled };
}

async function submitReason(reason: string): Promise<void> {
  if (reason !== '') await userEvent.type(screen.getByLabelText('Причина отмены'), reason);
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отмену' }));
}

describe('CancelAppointmentDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should be a modal dialog named after its title and describe which appointment it cancels', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Отмена записи' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/10:00 · Иванова Мария Сергеевна/);
  });

  it('should move the focus to the reason field when it opens', () => {
    renderDialog();

    expect(screen.getByLabelText('Причина отмены')).toHaveFocus();
  });

  it('should ask for a reason and not call the API when the reason is empty', async () => {
    renderDialog();

    await submitReason('');

    expect(await screen.findByText('Укажите причину отмены')).toBeInTheDocument();
    expect(screen.getByLabelText('Причина отмены')).toHaveAttribute('aria-invalid', 'true');
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('should explain the minimum length when the reason has fewer than 3 characters', async () => {
    renderDialog();

    await submitReason('ab');

    expect(await screen.findByText('Причина должна содержать не менее 3 символов')).toBeInTheDocument();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('should not accept a reason made of spaces only', async () => {
    renderDialog();

    await submitReason('     ');

    expect(await screen.findByText('Укажите причину отмены')).toBeInTheDocument();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('should explain the maximum length when the reason has more than 500 characters', async () => {
    renderDialog();
    const field = screen.getByLabelText('Причина отмены');
    await userEvent.click(field);
    await userEvent.paste('я'.repeat(501));

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить отмену' }));

    expect(await screen.findByText('Причина не должна быть длиннее 500 символов')).toBeInTheDocument();
  });

  it('should send the trimmed reason for this appointment and report success', async () => {
    cancelMock.mockResolvedValue({});
    const { onCancelled } = renderDialog();

    await submitReason('  Заболел  ');

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(cancelMock).toHaveBeenCalledWith('1552', 'Заболел');
  });

  it('should mark the submit button as unavailable and say so while the request is running, keeping the focus on it', async () => {
    cancelMock.mockReturnValue(new Promise(() => undefined));
    renderDialog();

    await submitReason('Заболел');

    const busy = await screen.findByRole('button', { name: 'Отменяем…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
  });

  it('should explain that the appointment cannot be cancelled and offer only to close when the server answers 409 (BR-002)', async () => {
    cancelMock.mockRejectedValue(apiProblem(409, 'APPOINTMENT_NOT_CANCELLABLE'));
    const { onClose } = renderDialog();

    await submitReason('Заболел');

    expect(await screen.findByRole('alert')).toHaveTextContent('Эту запись уже нельзя отменить');
    expect(screen.queryByRole('button', { name: 'Подтвердить отмену' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should show the server message on the reason field when the server rejects the reason (400)', async () => {
    cancelMock.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'reason', message: 'reason must be longer than or equal to 3 characters' }] }));
    renderDialog();

    await submitReason('Заболел');

    expect(await screen.findByText('Слишком короткое значение')).toBeInTheDocument();
    expect(screen.getByLabelText('Причина отмены')).toHaveAttribute('aria-invalid', 'true');
  });

  it('should show a banner with the request id when the server fails', async () => {
    cancelMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-7' }));
    renderDialog();

    await submitReason('Заболел');

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-7');
    expect(screen.getByRole('button', { name: 'Подтвердить отмену' })).toBeEnabled();
  });

  it('should close without cancelling when the user keeps the appointment', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Не отменять' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('should close when Escape is pressed', async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should keep the focus inside the dialog when Tab is pressed on the last control', async () => {
    renderDialog();
    screen.getByRole('button', { name: 'Не отменять' }).focus();

    await userEvent.tab();

    expect(screen.getByLabelText('Причина отмены')).toHaveFocus();
  });

  it('should ignore "Do not cancel" while the request is in flight, because the cancellation is already on its way', async () => {
    cancelMock.mockReturnValue(new Promise(() => undefined));
    const { onClose } = renderDialog();
    await submitReason('Заболел');

    await userEvent.click(await screen.findByRole('button', { name: 'Не отменять' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Не отменять' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should ignore Escape while the request is in flight', async () => {
    cancelMock.mockReturnValue(new Promise(() => undefined));
    const { onClose } = renderDialog();
    await submitReason('Заболел');
    await screen.findByRole('button', { name: 'Отменяем…' });

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('should close on Escape again after the request failed', async () => {
    cancelMock.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    const { onClose } = renderDialog();
    await submitReason('Заболел');
    await screen.findByTestId('problem-banner');

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should send the cancellation once when the form is submitted again while the request is in flight', async () => {
    cancelMock.mockReturnValue(new Promise(() => undefined));
    renderDialog();
    await submitReason('Заболел');
    await screen.findByRole('button', { name: 'Отменяем…' });

    await userEvent.click(screen.getByRole('button', { name: 'Отменяем…' }));

    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it('should still announce the cancellation when the dialog is gone before the answer arrives', async () => {
    let answer: () => void = () => undefined;
    cancelMock.mockReturnValue(new Promise((resolve) => { answer = () => resolve({}); }));
    const view = renderWithClient(<CancelAppointmentDialog appointment={appointmentFixture()} onClose={jest.fn()} onCancelled={jest.fn()} />);
    await submitReason('Заболел');

    view.unmount();
    answer();

    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Запись отменена'));
  });

  it('should say the server cannot be reached, without an error code, when the connection is lost', async () => {
    cancelMock.mockRejectedValue(apiProblem(0, 'INTERNAL'));
    renderDialog();

    await submitReason('Заболел');

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByTestId('code-chip')).not.toBeInTheDocument();
  });
});
