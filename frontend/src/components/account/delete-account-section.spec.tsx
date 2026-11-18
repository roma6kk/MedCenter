import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as api from '@/components/patient/patient-api';
import * as session from '@/lib/auth/session-client';
import { DeleteAccountSection } from './delete-account-section';

jest.mock('@/components/patient/patient-api');
jest.mock('@/lib/auth/session-client');
const mockedApi = jest.mocked(api);
const mockedSession = jest.mocked(session);

async function openDialog(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Удалить учётную запись' }));
  return screen.findByRole('dialog');
}

describe('DeleteAccountSection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should offer the deletion as a danger zone and open nothing until it is pressed', () => {
    renderWithClient(<DeleteAccountSection />);

    expect(screen.getByRole('heading', { name: 'Удаление учётной записи' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should say what is removed, what is kept and why, and point to the written application and the policy', async () => {
    renderWithClient(<DeleteAccountSection />);

    const dialog = within(await openDialog());

    expect(dialog.getByText(/Доступ к личному кабинету, вход по email и паролю и текущий сеанс/)).toBeInTheDocument();
    expect(dialog.getByText(/хранятся по требованию законодательства о здравоохранении, срок — по номенклатуре дел оператора/)).toBeInTheDocument();
    expect(dialog.getByText(/письменным заявлением в клинику/)).toBeInTheDocument();
    expect(dialog.getByRole('link', { name: 'политике обработки персональных данных' })).toHaveAttribute('href', '/privacy');
    expect(document.body.textContent).not.toMatch(/ЭМК|ЭМД/);
  });

  it('should not call the server and should mark the field when the password is empty', async () => {
    renderWithClient(<DeleteAccountSection />);
    const dialog = within(await openDialog());

    await userEvent.click(dialog.getByRole('button', { name: 'Удалить учётную запись' }));

    expect(await dialog.findByText('Введите пароль')).toBeInTheDocument();
    expect(mockedApi.closeMyAccount).not.toHaveBeenCalled();
  });

  it('should show a wrong-password message and keep the session when the server answers 403', async () => {
    mockedApi.closeMyAccount.mockRejectedValue(apiProblem(403, 'FORBIDDEN_ROLE'));
    renderWithClient(<DeleteAccountSection />);
    const dialog = within(await openDialog());

    await userEvent.type(dialog.getByLabelText('Текущий пароль'), 'Wrong!Pass1');
    await userEvent.click(dialog.getByRole('button', { name: 'Удалить учётную запись' }));

    expect(await dialog.findByText('Пароль неверный или учётная запись уже закрыта.')).toBeInTheDocument();
    expect(mockedSession.endClosedAccountSession).not.toHaveBeenCalled();
  });

  it('should send the password and end the session when the server accepts', async () => {
    mockedApi.closeMyAccount.mockResolvedValue(undefined);
    mockedSession.endClosedAccountSession.mockResolvedValue(undefined);
    renderWithClient(<DeleteAccountSection />);
    const dialog = within(await openDialog());

    await userEvent.type(dialog.getByLabelText('Текущий пароль'), 'Str0ng!Pass');
    await userEvent.click(dialog.getByRole('button', { name: 'Удалить учётную запись' }));

    await waitFor(() => expect(mockedSession.endClosedAccountSession).toHaveBeenCalledTimes(1));
    expect(mockedApi.closeMyAccount).toHaveBeenCalledWith('Str0ng!Pass');
  });

  it('should close the dialog without calling the server when the patient keeps the account', async () => {
    renderWithClient(<DeleteAccountSection />);
    const dialog = within(await openDialog());

    await userEvent.click(dialog.getByRole('button', { name: 'Оставить учётную запись' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedApi.closeMyAccount).not.toHaveBeenCalled();
  });
});
