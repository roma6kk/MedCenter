import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountFixture, patientProfileFixture } from './cabinet-fixtures';
import { apiProblem, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { ProfileView } from './profile-view';
import { useUiStore } from '@/store/use-ui-store';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));

import { fetchAccount, fetchPatientProfile } from './patient-api';

const accountMock = fetchAccount as jest.MockedFunction<typeof fetchAccount>;
const patientMock = fetchPatientProfile as jest.MockedFunction<typeof fetchPatientProfile>;

function account(): HTMLElement {
  return screen.getByRole('region', { name: 'Учётная запись' });
}

function patientCard(name: string = 'Карточка пациента'): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('ProfileView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should show the account from /me: name, email, active status and the registration day', async () => {
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(await within(account()).findByText('Лебедева Анна')).toBeInTheDocument();
    expect(within(account()).getByText('patient.lebedeva@medcenter.test')).toBeInTheDocument();
    expect(within(account()).getByText('Активна')).toBeInTheDocument();
    expect(within(account()).getByText('15 окт. 2026 г.')).toBeInTheDocument();
  });

  it('should show the FHIR patient card from /me/patient: birth date, sex and contacts', async () => {
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(await within(patientCard()).findByText('2 ноября 1992 г.')).toBeInTheDocument();
    expect(within(patientCard()).getByText('Женский')).toBeInTheDocument();
    expect(within(patientCard()).getByText(/Телефон:/)).toBeInTheDocument();
    expect(within(patientCard()).getByText('+375291234567')).toBeInTheDocument();
    expect(within(patientCard()).getByText('patient.lebedeva@medcenter.test')).toBeInTheDocument();
  });

  it('should say the data is read-only and name the page', async () => {
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(screen.getByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText(/Данные доступны только для просмотра/)).toBeInTheDocument();
    expect(document.title).toBe('Профиль — МедЦентр');
    await within(account()).findByText('Лебедева Анна');
  });

  it('should show loading skeletons in both sections while the reads are running', () => {
    accountMock.mockReturnValue(new Promise(() => undefined));
    patientMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<ProfileView />);

    expect(screen.getAllByTestId('table-skeleton')).toHaveLength(2);
  });

  it('should explain that the patient card does not exist yet instead of an error screen when /me/patient answers 404', async () => {
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));

    renderWithClient(<ProfileView />);

    expect(await screen.findByTestId('no-patient')).toHaveTextContent('Карточка пациента ещё не создана.');
    expect(within(account()).getByText('Лебедева Анна')).toBeInTheDocument();
    expect(screen.queryByTestId('not-found-state')).not.toBeInTheDocument();
  });

  it('should keep the account visible and offer a retry for the card when only /me/patient fails', async () => {
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-21' }));
    patientMock.mockResolvedValue(patientProfileFixture());
    renderWithClient(<ProfileView />);

    expect(await within(patientCard()).findByTestId('problem-banner')).toHaveTextContent('req-21');
    expect(within(account()).getByText('Лебедева Анна')).toBeInTheDocument();
    await userEvent.click(within(patientCard()).getByRole('button', { name: 'Повторить' }));

    expect(await within(patientCard()).findByText('Женский')).toBeInTheDocument();
  });

  it('should show a banner for the account when /me fails', async () => {
    accountMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-22' }));
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(await within(account()).findByTestId('problem-banner')).toHaveTextContent('req-22');
  });

  it('should show the disabled status of an inactive account', async () => {
    accountMock.mockResolvedValue(accountFixture({ isActive: false }));
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(await within(account()).findByText('Отключена')).toBeInTheDocument();
  });

  it('should fall back to the parts of the name and an unknown sex when the card is sparse', async () => {
    accountMock.mockResolvedValue(accountFixture({ name: undefined }));
    patientMock.mockResolvedValue(patientProfileFixture({ fullName: '', middleName: 'Игоревна', gender: undefined, birthDate: undefined, telecom: [] }));

    renderWithClient(<ProfileView />);

    expect(await within(patientCard()).findByText('Лебедева Анна Игоревна')).toBeInTheDocument();
    expect(within(patientCard()).getByText('Не указан')).toBeInTheDocument();
    expect(within(patientCard()).queryByText('Дата рождения')).not.toBeInTheDocument();
    expect(within(patientCard()).queryByText('Контакты')).not.toBeInTheDocument();
  });

  it('should show the card in English when the locale is en', async () => {
    useUiStore.setState({ locale: 'en' });
    accountMock.mockResolvedValue(accountFixture());
    patientMock.mockResolvedValue(patientProfileFixture());

    renderWithClient(<ProfileView />);

    expect(await screen.findByRole('region', { name: 'Patient card' })).toBeInTheDocument();
    expect(await within(patientCard('Patient card')).findByText('2 November 1992')).toBeInTheDocument();
  });
});
