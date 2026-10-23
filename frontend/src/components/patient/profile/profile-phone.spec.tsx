import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useToastStore } from '@/store/use-toast-store';
import { accountFixture, patientProfileFixture } from '../cabinet-fixtures';
import { apiProblem, newQueryClient, renderWithClient, resetCabinetState } from '../cabinet-test-utils';
import { ProfilePersonalData } from './profile-personal-data';

jest.mock('../patient-api', () => ({ fetchAccount: jest.fn(), fetchPatientProfile: jest.fn(), updateMyPhone: jest.fn() }));

import { fetchAccount, fetchPatientProfile, updateMyPhone } from '../patient-api';

const accountMock = fetchAccount as jest.MockedFunction<typeof fetchAccount>;
const patientMock = fetchPatientProfile as jest.MockedFunction<typeof fetchPatientProfile>;
const updateMock = updateMyPhone as jest.MockedFunction<typeof updateMyPhone>;

const NO_PHONE = { telecom: [{ system: 'email', value: 'patient.lebedeva@medcenter.test', use: 'home' }] };

async function open(name = 'Изменить телефон'): Promise<HTMLElement> {
  renderWithClient(<ProfilePersonalData />);
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.getByTestId('phone-form');
}

describe('the phone of the patient card (API 3.12)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockResolvedValue(patientProfileFixture());
  });

  it('should open a form holding the current number and close it again on cancel', async () => {
    const form = await open();

    expect(within(form).getByLabelText('Телефон')).toHaveValue('+375291234567');
    await userEvent.click(within(form).getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByTestId('phone-form')).not.toBeInTheDocument();
    expect(screen.getByText('+375291234567')).toBeInTheDocument();
  });

  it('should offer to add a number when the card has none', async () => {
    patientMock.mockResolvedValue(patientProfileFixture(NO_PHONE));

    const form = await open('Добавить телефон');

    expect(within(form).getByLabelText('Телефон')).toHaveValue('');
  });

  it('should send the normalised number with the version of the card and confirm when the server accepts it', async () => {
    updateMock.mockResolvedValue(patientProfileFixture({ version: '4', telecom: [{ system: 'phone', value: '+375299999999', use: 'mobile' }] }));
    const form = await open();

    await userEvent.clear(within(form).getByLabelText('Телефон'));
    await userEvent.type(within(form).getByLabelText('Телефон'), '+375 (29) 999-99-99');
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ phone: '+375299999999', version: '3' }));
    await waitFor(() => expect(screen.queryByTestId('phone-form')).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ tone: 'success', message: 'Телефон сохранён' })]);
  });

  it('should refetch the card after a save so the new number and version are shown', async () => {
    updateMock.mockResolvedValue(patientProfileFixture());
    patientMock.mockResolvedValueOnce(patientProfileFixture()).mockResolvedValue(patientProfileFixture({ version: '4', telecom: [{ system: 'phone', value: '+375299999999', use: 'mobile' }] }));
    const form = await open();

    await userEvent.clear(within(form).getByLabelText('Телефон'));
    await userEvent.type(within(form).getByLabelText('Телефон'), '+375299999999');
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('+375299999999')).toBeInTheDocument();
    expect(patientMock).toHaveBeenCalledTimes(2);
  });

  it('should refuse a foreign number without calling the API', async () => {
    const form = await open();

    await userEvent.clear(within(form).getByLabelText('Телефон'));
    await userEvent.type(within(form).getByLabelText('Телефон'), '+7 912 345 67 89');
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('+375');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('should show a server field error next to the phone and keep the form open', async () => {
    updateMock.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'phone', message: 'phone must be a Belarus number: +375 and nine digits' }] }));
    const form = await open();

    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByLabelText('Телефон')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('phone-form')).toBeInTheDocument();
  });

  it('should tell the patient the card changed, reload it and keep the form open on a version conflict', async () => {
    updateMock.mockRejectedValue(apiProblem(409, 'CONFLICT'));
    patientMock.mockResolvedValueOnce(patientProfileFixture()).mockResolvedValue(patientProfileFixture({ version: '4' }));
    const form = await open();

    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('Карточка изменилась');
    await waitFor(() => expect(patientMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('phone-form')).toBeInTheDocument();
  });

  it('should show the problem banner when the save fails for another reason', async () => {
    updateMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-77' }));
    const form = await open();

    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    expect(await within(form).findByTestId('problem-banner')).toHaveTextContent('req-77');
  });

  it('should not offer to edit when the card could not be read', async () => {
    patientMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));
    renderWithClient(<ProfilePersonalData />, newQueryClient());

    expect(await screen.findByTestId('no-patient')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /телефон/i })).not.toBeInTheDocument();
  });
});
