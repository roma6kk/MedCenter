import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { useUiStore } from '@/store/use-ui-store';
import { accountFixture, historyFixture, medicationFixture, patientProfileFixture, serviceFixture } from './cabinet-fixtures';
import { apiProblem, pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { ProfileView } from './profile-view';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));
jest.mock('@/components/appointments/appointment-api', () => ({ fetchAppointments: jest.fn(), fetchAppointment: jest.fn(), cancelAppointment: jest.fn() }));

jest.mock('@/components/consent/consent-api');

import { fetchAppointments } from '@/components/appointments/appointment-api';
import { fetchMyConsent } from '@/components/consent/consent-api';
import { NONE } from '@/components/consent/consent-fixtures';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from './patient-api';

const accountMock = fetchAccount as jest.MockedFunction<typeof fetchAccount>;
const patientMock = fetchPatientProfile as jest.MockedFunction<typeof fetchPatientProfile>;
const historyMock = fetchMyHistory as jest.MockedFunction<typeof fetchMyHistory>;
const prescriptionsMock = fetchMyPrescriptions as jest.MockedFunction<typeof fetchMyPrescriptions>;
const appointmentsMock = fetchAppointments as jest.MockedFunction<typeof fetchAppointments>;

/** An old visit (no "repeat" rule), a patient aged 40+ with an ECG long ago is not needed: defaults give a quiet page. */
function loadAll(overrides: { patient?: Parameters<typeof patientProfileFixture>[0] } = {}): void {
  accountMock.mockResolvedValue(accountFixture());
  patientMock.mockResolvedValue(patientProfileFixture(overrides.patient));
  historyMock.mockResolvedValue(pageOf([]));
  prescriptionsMock.mockResolvedValue(pageOf([]));
  appointmentsMock.mockResolvedValue(pageOf([]));
}

const consentMock = fetchMyConsent as jest.MockedFunction<typeof fetchMyConsent>;

const region = (name: string): HTMLElement => screen.getByRole('region', { name });

describe('ProfileView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consentMock.mockResolvedValue(NONE);
    resetCabinetState();
    window.localStorage.clear();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'], now: new Date('2026-10-22T09:00:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  it('should show the name as the page heading with age, e-mail and the active account chip, and set the title', async () => {
    loadAll();
    renderWithClient(<ProfileView />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Лебедева Анна' })).toBeInTheDocument();
    const header = region('Лебедева Анна');
    expect(within(header).getByText(/Возраст: 33 · Женский · Пациент клиники с 15 окт\. 2026 г\./)).toBeInTheDocument();
    expect(within(header).getByText('patient.lebedeva@medcenter.test')).toBeInTheDocument();
    expect(within(header).getByText('Учётная запись активна')).toBeInTheDocument();
    expect(within(header).getByRole('img', { name: 'Профиль заполнен на 100 процентов' })).toBeInTheDocument();
    expect(within(header).queryByText('Телефон не указан')).not.toBeInTheDocument();
    expect(document.title).toBe('Профиль — Лайфлайн');
  });

  it('should show the consent to the electronic record next to the personal data (ADR-019)', async () => {
    loadAll();
    renderWithClient(<ProfileView />);

    const section = await screen.findByRole('region', { name: 'Согласие на электронную медкарту' });
    expect(await within(section).findByText('Согласие не оформлено')).toBeInTheDocument();
  });

  it('should warn about a missing phone in the header, the ring, the personal data and a recommendation', async () => {
    loadAll({ patient: { telecom: [{ system: 'email', value: 'a@b.test' }] } });
    renderWithClient(<ProfileView />);

    const header = await screen.findByRole('region', { name: 'Лебедева Анна' });
    expect(await within(header).findByText('Телефон не указан')).toBeInTheDocument();
    expect(within(header).getByText('Профиль заполнен на 75%')).toBeInTheDocument();
    expect(within(header).getByText(/Не хватает: телефона/)).toBeInTheDocument();
    expect(await within(region('Личные данные')).findByText('Не указан', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByTestId('reco-phone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Как добавить' })).toHaveAttribute('href', '#profile-data');
  });

  it('should say who changes the data instead of offering an edit button', async () => {
    loadAll();
    renderWithClient(<ProfileView />);

    const data = await screen.findByRole('region', { name: 'Личные данные' });
    expect(within(data).getByText(/обратитесь в регистратуру клиники/)).toBeInTheDocument();
    expect(within(data).queryByRole('button')).not.toBeInTheDocument();
    expect(await within(data).findByText('2 ноября 1992 г.')).toBeInTheDocument();
    expect(within(data).getByText('Женский')).toBeInTheDocument();
    expect(within(data).getByText('+375291234567')).toBeInTheDocument();
    expect(within(data).getByText('Активна')).toBeInTheDocument();
  });

  it('should count booked appointments and active prescriptions in the quick actions', async () => {
    loadAll();
    appointmentsMock.mockResolvedValue(pageOf([appointmentFixture({ id: 'a1', start: '2026-10-23T09:00:00Z' }), appointmentFixture({ id: 'a2', start: '2026-10-25T09:00:00Z' }), appointmentFixture({ id: 'a3', status: 'cancelled' })]));
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ id: 'm1' }), medicationFixture({ id: 'm2', status: 'completed' })]));
    renderWithClient(<ProfileView />);

    const actions = screen.getByRole('list', { name: 'Быстрые действия' });
    expect(await within(actions).findByText('Предстоящих: 2')).toBeInTheDocument();
    expect(within(actions).getByText('Действующих: 1')).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: /Записаться на приём/ })).toHaveAttribute('href', '/booking');
    expect(within(actions).getByRole('link', { name: /Мои записи/ })).toHaveAttribute('href', '/appointments');
  });

  it('should show the nearest visit, the other count, the last visit and the doctors of the upcoming ones', async () => {
    loadAll();
    appointmentsMock.mockResolvedValue(pageOf([appointmentFixture({ id: 'a1', start: '2026-10-23T09:00:00Z' }), appointmentFixture({ id: 'a2', start: '2026-10-25T09:00:00Z', doctorName: 'Петров Пётр' })]));
    historyMock.mockResolvedValue(pageOf([historyFixture({ date: '2026-09-01T07:00:00Z' })]));
    renderWithClient(<ProfileView />);

    const next = await screen.findByTestId('profile-next');
    expect(await within(next).findByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(within(next).getByRole('link', { name: 'Подробнее' })).toHaveAttribute('href', '/appointments/a1');
    expect(within(next).getByRole('link', { name: 'Ещё записей: 1' })).toBeInTheDocument();
    const last = await screen.findByTestId('profile-last');
    expect(within(last).getByText('J06.9')).toBeInTheDocument();
    expect(within(last).getByText('Обильное питьё, покой.')).toBeInTheDocument();
    const doctors = region('Мои врачи');
    expect(within(doctors).getAllByRole('listitem')).toHaveLength(2);
    expect(within(doctors).getByRole('link', { name: 'Открыть запись к врачу Петров Пётр' })).toHaveAttribute('href', '/appointments/a2');
  });

  it('should explain an empty history and no appointments and offer to book', async () => {
    loadAll();
    renderWithClient(<ProfileView />);

    expect(await within(await screen.findByTestId('profile-next')).findByText('Предстоящих записей нет.')).toBeInTheDocument();
    expect(within(screen.getByTestId('profile-next')).getByRole('link', { name: 'Записаться' })).toHaveAttribute('href', '/booking');
    expect(await within(screen.getByTestId('profile-last')).findByText('Завершённых приёмов пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Мои врачи' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('reco-empty')).toHaveTextContent('Новых рекомендаций нет');
  });

  describe('recommendations', () => {
    it('should offer an ECG to a patient over 40 and not to a younger one', async () => {
      loadAll({ patient: { birthDate: '1985-03-14' } });
      const { unmount } = renderWithClient(<ProfileView />);
      expect(await screen.findByTestId('reco-ecg')).toHaveTextContent('ЭКГ раз в год');
      expect(within(screen.getByTestId('reco-ecg')).getByRole('link', { name: 'Записаться на ЭКГ' })).toHaveAttribute('href', '/booking');
      unmount();

      jest.resetAllMocks();
      loadAll();
      renderWithClient(<ProfileView />);
      await screen.findByTestId('reco-empty');
      expect(screen.queryByTestId('reco-ecg')).not.toBeInTheDocument();
    });

    it('should suggest a repeat visit after a recent visit with advice and no follow-up, and a referral', async () => {
      loadAll();
      historyMock.mockResolvedValue(pageOf([historyFixture({ date: '2026-10-19T07:00:00Z' })]));
      prescriptionsMock.mockResolvedValue(pageOf([serviceFixture({ id: 's1', status: 'active', display: 'Общий анализ крови' })]));
      renderWithClient(<ProfileView />);

      expect(await screen.findByTestId('reco-repeat-visit')).toHaveTextContent('По итогам приёма 19 октября 2026 г.');
      expect(screen.getByTestId('reco-referral-s1')).toHaveTextContent('Направление: Общий анализ крови');
    });

    it('should hide a recommendation, remember it per patient and bring it back with "Показать скрытые"', async () => {
      loadAll({ patient: { birthDate: '1985-03-14' } });
      renderWithClient(<ProfileView />);

      await userEvent.click(await screen.findByRole('button', { name: 'Скрыть рекомендацию: ЭКГ раз в год' }));
      expect(screen.queryByTestId('reco-ecg')).not.toBeInTheDocument();
      expect(screen.getByTestId('reco-empty')).toBeInTheDocument();
      expect(window.localStorage.getItem('medcenter.profile.hiddenRecommendations.1442')).toBe('["ecg"]');

      await userEvent.click(screen.getByRole('button', { name: 'Показать скрытые' }));
      expect(await screen.findByTestId('reco-ecg')).toBeInTheDocument();
    });

    it('should keep a hidden recommendation hidden after a reload', async () => {
      window.localStorage.setItem('medcenter.profile.hiddenRecommendations.1442', '["ecg"]');
      loadAll({ patient: { birthDate: '1985-03-14' } });
      renderWithClient(<ProfileView />);

      expect(await screen.findByTestId('reco-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('reco-ecg')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Показать скрытые' })).toBeInTheDocument();
    });

    it('should show a retry for the block when the history fails and keep the rest of the page', async () => {
      loadAll();
      historyMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-31' }));
      renderWithClient(<ProfileView />);

      const reco = await screen.findByTestId('profile-recommendations');
      expect(await within(reco).findByTestId('problem-banner')).toHaveTextContent('req-31');
      expect(within(reco).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Лебедева Анна' })).toBeInTheDocument();
      expect(within(screen.getByTestId('profile-next')).getByText('Предстоящих записей нет.')).toBeInTheDocument();
    });
  });

  describe('failures and sparse data', () => {
    it('should explain that the patient card does not exist yet when /me/patient answers 404', async () => {
      loadAll();
      patientMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));
      renderWithClient(<ProfileView />);

      expect(await screen.findByTestId('no-patient')).toHaveTextContent('Карточка пациента ещё не создана.');
      expect(screen.getByRole('heading', { level: 1, name: 'Лебедева Анна' })).toBeInTheDocument();
      expect(within(region('Лебедева Анна')).getByRole('img', { name: 'Профиль заполнен на 25 процентов' })).toBeInTheDocument();
      expect(screen.queryByTestId('not-found-state')).not.toBeInTheDocument();
    });

    it('should keep the account and offer a retry for the card when only /me/patient fails, without a ring', async () => {
      loadAll();
      patientMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-21' }));
      patientMock.mockResolvedValue(patientProfileFixture());
      renderWithClient(<ProfileView />);

      const data = await screen.findByRole('region', { name: 'Личные данные' });
      expect(await within(data).findByTestId('problem-banner')).toHaveTextContent('req-21');
      expect(within(data).getByText('Лебедева Анна')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /Профиль заполнен/ })).not.toBeInTheDocument();
      await userEvent.click(within(data).getByRole('button', { name: 'Повторить' }));

      expect(await within(data).findByText('Женский')).toBeInTheDocument();
      expect(await screen.findByRole('img', { name: 'Профиль заполнен на 100 процентов' })).toBeInTheDocument();
    });

    it('should show a banner under the page heading when /me fails', async () => {
      loadAll();
      accountMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-22' }));
      renderWithClient(<ProfileView />);

      expect(await screen.findByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByTestId('problem-banner').length).toBeGreaterThan(0));
      expect(screen.getAllByTestId('problem-banner')[0]).toHaveTextContent('req-22');
    });

    it('should show loading skeletons while the reads run', () => {
      const never = new Promise<never>(() => undefined);
      for (const mock of [accountMock, patientMock, historyMock, prescriptionsMock, appointmentsMock]) (mock as jest.Mock).mockReturnValue(never);
      renderWithClient(<ProfileView />);

      expect(screen.getAllByTestId('table-skeleton').length).toBeGreaterThanOrEqual(2);
    });

    it('should show the disabled status of an inactive account', async () => {
      loadAll();
      accountMock.mockResolvedValue(accountFixture({ isActive: false }));
      renderWithClient(<ProfileView />);

      expect(await within(await screen.findByRole('region', { name: 'Лебедева Анна' })).findByText('Учётная запись отключена')).toBeInTheDocument();
    });

    it('should fall back to the parts of the name and an unknown sex when the card is sparse', async () => {
      loadAll();
      accountMock.mockResolvedValue(accountFixture({ name: undefined }));
      patientMock.mockResolvedValue(patientProfileFixture({ fullName: '', middleName: 'Игоревна', gender: undefined, birthDate: undefined, telecom: [] }));
      renderWithClient(<ProfileView />);

      const data = await screen.findByRole('region', { name: 'Личные данные' });
      expect(await within(data).findByText('Лебедева Анна Игоревна')).toBeInTheDocument();
      expect(within(data).getByText('Не указан', { selector: 'dd' })).toBeInTheDocument();
      expect(within(data).queryByText('Дата рождения')).not.toBeInTheDocument();
      expect(within(data).queryByText('Контакты')).not.toBeInTheDocument();
    });
  });

  it('should render in English when the locale is en', async () => {
    useUiStore.setState({ locale: 'en' });
    loadAll();
    renderWithClient(<ProfileView />);

    expect(await screen.findByRole('region', { name: 'Personal data' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Quick actions' })).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'Personal data' })).findByText('2 November 1992')).toBeInTheDocument();
  });
});
