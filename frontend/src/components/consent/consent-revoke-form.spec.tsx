import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import * as api from './consent-api';
import { ACTIVE_RECORD } from './consent-fixtures';
import { ConsentRevokeForm } from './consent-revoke-form';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

const submit = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Записать отзыв' }));

describe('ConsentRevokeForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    mocked.postPatientConsentRevoke.mockResolvedValue({ ...ACTIVE_RECORD, status: 'inactive' });
  });

  it('should explain what the written revocation does', () => {
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    expect(screen.getByRole('heading', { name: 'Записать отзыв' })).toBeInTheDocument();
    expect(screen.getByText(/существующие не удаляются/)).toBeInTheDocument();
  });

  it('should ask for the application number and send nothing without it', async () => {
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    await submit();

    expect(await screen.findByText('Поле обязательно для заполнения')).toBeInTheDocument();
    expect(mocked.postPatientConsentRevoke).not.toHaveBeenCalled();
  });

  it('should send the trimmed application number, clear the field and say it is recorded', async () => {
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    await userEvent.type(screen.getByLabelText('Номер заявления'), ' З-7 ');
    await submit();

    await waitFor(() => expect(mocked.postPatientConsentRevoke).toHaveBeenCalledWith('p1', { applicationNumber: 'З-7' }));
    await waitFor(() => expect(screen.getByLabelText('Номер заявления')).toHaveValue(''));
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Отзыв согласия записан.');
  });

  it('should say there is nothing to revoke when the server finds no active consent (404)', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    await userEvent.type(screen.getByLabelText('Номер заявления'), 'З-7');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Отзывать нечего: действующего согласия нет.');
  });

  it('should show the problem banner for any other failure', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-5' }));
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    await userEvent.type(screen.getByLabelText('Номер заявления'), 'З-7');
    await submit();

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-5');
  });

  it('should put a server field error on the application number', async () => {
    mocked.postPatientConsentRevoke.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'applicationNumber', message: 'applicationNumber must be shorter than or equal to 64 characters' }] }));
    renderWithClient(<ConsentRevokeForm patientId="p1" />);

    await userEvent.type(screen.getByLabelText('Номер заявления'), 'З-7');
    await submit();

    expect(await screen.findByLabelText('Номер заявления')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });
});
