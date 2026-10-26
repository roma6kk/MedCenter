import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import * as api from './consent-api';
import { ACTIVE_RECORD } from './consent-fixtures';
import { ConsentRevokeAction } from './consent-revoke-action';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

/** The trigger is a quiet button; the form lives in the dialog it opens (E3). */
const openDialog = async (): Promise<ReturnType<typeof within>> => {
  await userEvent.click(screen.getByRole('button', { name: 'Записать отзыв' }));
  return within(await screen.findByRole('dialog'));
};
const confirm = (dialog: ReturnType<typeof within>): Promise<void> => userEvent.click(dialog.getByRole('button', { name: 'Записать отзыв' }));

describe('ConsentRevokeAction', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    mocked.postPatientConsentRevoke.mockResolvedValue({ ...ACTIVE_RECORD, status: 'inactive' });
  });

  it('should show only a quiet button until it is pressed, with no form on the screen', () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);

    expect(screen.getByRole('button', { name: 'Записать отзыв' })).toHaveClass('text-destructive');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Номер заявления')).not.toBeInTheDocument();
  });

  it('should explain what the written revocation does and confirm with the solid red button', async () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);

    const dialog = await openDialog();

    expect(dialog.getByRole('heading', { name: 'Записать отзыв' })).toBeInTheDocument();
    expect(dialog.getByText(/существующие не удаляются/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Записать отзыв' })).toHaveClass('bg-destructive');
  });

  it('should ask for the application number and send nothing without it', async () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await confirm(dialog);

    expect(await screen.findByText('Поле обязательно для заполнения')).toBeInTheDocument();
    expect(mocked.postPatientConsentRevoke).not.toHaveBeenCalled();
  });

  it('should send the trimmed application number, close the dialog and say it is recorded', async () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.type(dialog.getByLabelText('Номер заявления'), ' З-7 ');
    await confirm(dialog);

    await waitFor(() => expect(mocked.postPatientConsentRevoke).toHaveBeenCalledWith('p1', { applicationNumber: 'З-7' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Отзыв согласия записан.');
  });

  it('should submit with Enter in the field as well', async () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.type(dialog.getByLabelText('Номер заявления'), 'З-8{Enter}');

    await waitFor(() => expect(mocked.postPatientConsentRevoke).toHaveBeenCalledWith('p1', { applicationNumber: 'З-8' }));
  });

  it('should leave the consent alone and close when the dialog is cancelled', async () => {
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.click(dialog.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocked.postPatientConsentRevoke).not.toHaveBeenCalled();
  });

  it('should say there is nothing to revoke when the server finds no active consent (404)', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.type(dialog.getByLabelText('Номер заявления'), 'З-7');
    await confirm(dialog);

    expect(await dialog.findByRole('alert')).toHaveTextContent('Отзывать нечего: действующего согласия нет.');
  });

  it('should show the problem banner for any other failure', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-5' }));
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.type(dialog.getByLabelText('Номер заявления'), 'З-7');
    await confirm(dialog);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-5');
  });

  it('should put a server field error on the application number', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'applicationNumber', message: 'applicationNumber must be shorter than or equal to 64 characters' }] }));
    renderWithClient(<ConsentRevokeAction patientId="p1" />);
    const dialog = await openDialog();

    await userEvent.type(dialog.getByLabelText('Номер заявления'), 'З-7');
    await confirm(dialog);

    expect(await screen.findByLabelText('Номер заявления')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });
});
