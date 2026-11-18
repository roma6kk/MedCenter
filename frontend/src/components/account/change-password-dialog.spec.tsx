import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as api from '@/components/patient/patient-api';
import * as session from '@/lib/auth/session-client';
import { ChangePasswordDialog } from './change-password-dialog';

jest.mock('@/components/patient/patient-api');
jest.mock('@/lib/auth/session-client');
const mockedApi = jest.mocked(api);
const mockedSession = jest.mocked(session);

async function fill(current: string, next: string): Promise<void> {
  const dialog = within(screen.getByRole('dialog'));
  await userEvent.type(dialog.getByLabelText('Текущий пароль'), current);
  await userEvent.type(dialog.getByLabelText('Новый пароль'), next);
  await userEvent.click(dialog.getByRole('button', { name: 'Сменить пароль' }));
}

describe('ChangePasswordDialog', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should not call the server when the new password is weak', async () => {
    renderWithClient(<ChangePasswordDialog onClose={jest.fn()} />);

    await fill('Str0ng!Pass', 'weak');

    expect(await screen.findByText(/Пароль недостаточно надёжный/)).toBeInTheDocument();
    expect(mockedApi.changeMyPassword).not.toHaveBeenCalled();
  });

  it('should send both passwords and sign the user out when the server accepts', async () => {
    mockedApi.changeMyPassword.mockResolvedValue(undefined);
    renderWithClient(<ChangePasswordDialog onClose={jest.fn()} />);

    await fill('Str0ng!Pass', 'N3w!Password');

    await waitFor(() => expect(mockedApi.changeMyPassword).toHaveBeenCalledWith('Str0ng!Pass', 'N3w!Password'));
    await waitFor(() => expect(mockedSession.endRevokedSession).toHaveBeenCalled());
  });

  it('should say the current password is wrong and keep the session when the server answers 403', async () => {
    mockedApi.changeMyPassword.mockRejectedValue(apiProblem(403, 'FORBIDDEN_ROLE'));
    renderWithClient(<ChangePasswordDialog onClose={jest.fn()} />);

    await fill('Wrong!Pass1', 'N3w!Password');

    expect(await screen.findByText('Текущий пароль неверный.')).toBeInTheDocument();
    expect(mockedSession.endRevokedSession).not.toHaveBeenCalled();
  });
});
