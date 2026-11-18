import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { useUiStore } from '@/store/use-ui-store';
import { accountFixture, historyFixture, medicationFixture, patientProfileFixture, serviceFixture } from './cabinet-fixtures';
import { apiProblem, pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { HomeView } from './home-view';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn(), updateMyPhone: jest.fn() }));
jest.mock('@/components/appointments/appointment-api', () => ({ fetchAppointments: jest.fn(), fetchAppointment: jest.fn(), cancelAppointment: jest.fn() }));

jest.mock('@/components/consent/consent-api');

import { fetchAppointments } from '@/components/appointments/appointment-api';
import { fetchMyConsent } from '@/components/consent/consent-api';
import { NONE } from '@/components/consent/consent-fixtures';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile, updateMyPhone } from './patient-api';

const accountMock = fetchAccount as jest.MockedFunction<typeof fetchAccount>;
const patientMock = fetchPatientProfile as jest.MockedFunction<typeof fetchPatientProfile>;
const historyMock = fetchMyHistory as jest.MockedFunction<typeof fetchMyHistory>;
const updateMock = updateMyPhone as jest.MockedFunction<typeof updateMyPhone>;
const prescriptionsMock = fetchMyPrescriptions as jest.MockedFunction<typeof fetchMyPrescriptions>;
const appointmentsMock = fetchAppointments as jest.MockedFunction<typeof fetchAppointments>;

function loadAll(overrides: { patient?: Parameters<typeof patientProfileFixture>[0] } = {}): void {
  accountMock.mockResolvedValue(accountFixture());
  patientMock.mockResolvedValue(patientProfileFixture(overrides.patient));
  historyMock.mockResolvedValue(pageOf([]));
  prescriptionsMock.mockResolvedValue(pageOf([]));
  appointmentsMock.mockResolvedValue(pageOf([]));
}

const consentMock = fetchMyConsent as jest.MockedFunction<typeof fetchMyConsent>;

const region = (name: string): HTMLElement => screen.getByRole('region', { name });

describe('HomeView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    consentMock.mockResolvedValue(NONE);
    resetCabinetState();
    window.localStorage.clear();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'], now: new Date('2026-10-22T09:00:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  it('should greet the patient by name as the page heading and set the title', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Здравствуйте, Анна' })).toBeInTheDocument();
    expect(document.title).toBe('Главная — Лайфлайн');
  });

  it('should show the name and the e-mail once, in one «Личные данные» block, with the card rows and the completeness', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    const data = await screen.findByRole('region', { name: 'Личные данные' });
    expect(await within(data).findByTestId('profile-name')).toHaveTextContent('Лебедева Анна');
    expect(screen.getAllByText('Лебедева Анна')).toHaveLength(1);
    expect(screen.getAllByText('patient.lebedeva@medcenter.test')).toHaveLength(1);
    expect(screen.queryByText('Учётная запись')).not.toBeInTheDocument();
    expect(screen.queryByText('Карточка пациента')).not.toBeInTheDocument();
    expect(await within(data).findByText('2 ноября 1992 г.')).toBeInTheDocument();
    expect(within(data).getByText('Женский')).toBeInTheDocument();
    expect(within(data).getByText('+375291234567')).toBeInTheDocument();
    expect(within(data).getByText('Дата регистрации')).toBeInTheDocument();
    expect(within(data).getByRole('progressbar', { name: 'Профиль заполнен на 100 процентов' })).toHaveAttribute('aria-valuenow', '100');
    expect(within(data).queryByText('Активна')).not.toBeInTheDocument();
  });

  it('should keep the order of the home: greeting and hero, quick actions, recommendations, last visit, personal data', async () => {
    loadAll();
    renderWithClient(<HomeView />);
    await screen.findByRole('region', { name: 'Личные данные' });
    await screen.findByTestId('home-hero-empty');
    await screen.findByTestId('profile-recommendations');
    await screen.findByTestId('profile-last');

    const order = ['home-title', 'home-hero-empty', 'profile-recommendations', 'profile-last', 'profile-data'].map((id) => {
      const element = document.getElementById(id) ?? screen.queryByTestId(id);
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    const actions = screen.getByRole('list', { name: 'Быстрые действия' });
    const sequence: ReadonlyArray<HTMLElement> = [order[0] as HTMLElement, order[1] as HTMLElement, actions, order[2] as HTMLElement, order[3] as HTMLElement, order[4] as HTMLElement];
    sequence.slice(1).forEach((element, index) => {
      expect((sequence[index] as HTMLElement).compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('should show the consent to the electronic record next to the personal data (ADR-019)', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    const section = await screen.findByRole('region', { name: 'Согласие на внесение сведений в информационную систему клиники' });
    expect(await within(section).findByText('Согласие не оформлено')).toBeInTheDocument();
  });

  it('should offer the download of the patient\'s own data above the account deletion', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    const mine = await screen.findByRole('region', { name: 'Мои данные' });
    const danger = screen.getByRole('region', { name: 'Удаление учётной записи' });
    expect(within(mine).getByRole('button', { name: 'Скачать мои данные' })).toBeInTheDocument();
    expect(mine.compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should warn about a missing phone in the completeness, the personal data and a recommendation, and drop the old counter', async () => {
    loadAll({ patient: { telecom: [{ system: 'email', value: 'a@b.test' }] } });
    renderWithClient(<HomeView />);

    const data = await screen.findByRole('region', { name: 'Личные данные' });
    expect(await within(data).findByText('Профиль заполнен на 75%')).toBeInTheDocument();
    expect(within(data).getByText(/Не хватает: телефона/)).toBeInTheDocument();
    expect(within(data).queryByText(/Дополнить профиль можно в регистратуре/)).not.toBeInTheDocument();
    expect(await within(data).findByText('Не указан', { selector: 'span' })).toBeInTheDocument();
    expect(await screen.findByTestId('reco-phone')).toBeInTheDocument();
    expect(screen.queryByText(/\d из \d/)).not.toBeInTheDocument();
  });

  it('should open the phone entry right in the recommendation (B5) and send the number with the version of the card', async () => {
    loadAll({ patient: { telecom: [{ system: 'email', value: 'a@b.test' }] } });
    updateMock.mockResolvedValue(patientProfileFixture());
    renderWithClient(<HomeView />);

    const reco = await screen.findByTestId('reco-phone');
    expect(within(reco).queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(within(reco).getByRole('button', { name: 'Добавить номер' }));

    const input = within(reco).getByLabelText('Телефон');
    expect(input).toHaveFocus();
    await userEvent.type(input, '+375 29 123-45-67');
    await userEvent.click(within(reco).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ phone: '+375291234567', version: '3' }));
  });

  it('should close the inline phone entry on cancel and bring back the recommendation text', async () => {
    loadAll({ patient: { telecom: [] } });
    renderWithClient(<HomeView />);
    const reco = await screen.findByTestId('reco-phone');
    await userEvent.click(within(reco).getByRole('button', { name: 'Добавить номер' }));

    await userEvent.click(within(reco).getByRole('button', { name: 'Отмена' }));

    expect(within(reco).queryByLabelText('Телефон')).not.toBeInTheDocument();
    expect(within(reco).getByRole('button', { name: 'Добавить номер' })).toBeInTheDocument();
  });

  it('should keep the link to the personal data when the card has no version to edit with', async () => {
    loadAll({ patient: { telecom: [], version: undefined } });
    renderWithClient(<HomeView />);

    expect(await within(await screen.findByTestId('reco-phone')).findByRole('link', { name: 'Добавить номер' })).toHaveAttribute('href', '#profile-data');
  });

  it('should offer to change only the phone and say the front desk changes the rest', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    const data = await screen.findByRole('region', { name: 'Личные данные' });
    expect(within(data).getByText(/Остальные данные меняет регистратура клиники/)).toBeInTheDocument();
    expect(await within(data).findByRole('button', { name: 'Изменить телефон' })).toBeInTheDocument();
    expect(within(data).getAllByRole('button')).toHaveLength(1);
  });

  it('should count booked appointments and active prescriptions in the quick actions, which lead to the cabinet sections', async () => {
    loadAll();
    appointmentsMock.mockResolvedValue(pageOf([appointmentFixture({ id: 'a1', start: '2026-10-23T09:00:00Z' }), appointmentFixture({ id: 'a2', start: '2026-10-25T09:00:00Z' }), appointmentFixture({ id: 'a3', status: 'cancelled' })]));
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ id: 'm1' }), medicationFixture({ id: 'm2', status: 'completed' })]));
    renderWithClient(<HomeView />);

    const actions = screen.getByRole('list', { name: 'Быстрые действия' });
    expect(await within(actions).findByText('Предстоящих: 2')).toBeInTheDocument();
    expect(within(actions).getByText('Действующих: 1')).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: /Мои записи/ })).toHaveAttribute('href', '/appointments');
    expect(within(actions).getByRole('link', { name: /Назначения/ })).toHaveAttribute('href', '/medcard?tab=prescriptions');
    expect(within(actions).getByRole('link', { name: /История приёмов/ })).toHaveAttribute('href', '/medcard');
    expect(within(actions).queryByRole('link', { name: /Записаться/ })).not.toBeInTheDocument();
  });

  it('should show the nearest visit as the hero with its doctor in one format, the other count, the last visit and the doctors of the upcoming ones', async () => {
    loadAll();
    appointmentsMock.mockResolvedValue(pageOf([appointmentFixture({ id: 'a1', start: '2026-10-23T09:00:00Z' }), appointmentFixture({ id: 'a2', start: '2026-10-25T09:00:00Z', doctorName: 'Петров  Пётр' })]));
    historyMock.mockResolvedValue(pageOf([historyFixture({ date: '2026-09-01T07:00:00Z', doctorName: 'Иванова Мария Сергеевна' })]));
    renderWithClient(<HomeView />);

    const next = await screen.findByTestId('next-appointment');
    expect(await within(next).findByText(/Приём терапевта \(первичный\)/)).toBeInTheDocument();
    expect(within(next).getByText('Иванова Мария Сергеевна')).toBeInTheDocument();
    expect(within(next).getByRole('link', { name: /Подробнее/ })).toHaveAttribute('href', '/appointments/a1');
    expect(within(next).getByRole('link', { name: 'Ещё записей: 1' })).toHaveAttribute('href', '/appointments');
    expect(within(next).queryByRole('button')).not.toBeInTheDocument();
    const last = await screen.findByTestId('profile-last');
    expect(within(last).getByText('J06.9')).toBeInTheDocument();
    expect(within(last).getByText('Обильное питьё, покой.')).toBeInTheDocument();
    expect(within(last).getByText(/Иванова Мария Сергеевна/)).toBeInTheDocument();
    expect(within(last).getByRole('link', { name: 'Вся история приёмов' })).toHaveAttribute('href', '/medcard');
    const doctors = region('Мои врачи');
    expect(within(doctors).getAllByRole('listitem')).toHaveLength(2);
    expect(within(doctors).getByRole('link', { name: 'Открыть запись к врачу Петров Пётр' })).toHaveAttribute('href', '/appointments/a2');
  });

  it('should invite to book and explain an empty history when there are no visits at all', async () => {
    loadAll();
    renderWithClient(<HomeView />);

    const hero = await screen.findByTestId('home-hero-empty');
    expect(within(hero).getByText('Ближайших приёмов нет')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Записаться на приём' })).toHaveAttribute('href', '/booking');
    expect(await within(await screen.findByTestId('profile-last')).findByText('Завершённых приёмов пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Мои врачи' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('reco-empty')).toHaveTextContent('Новых рекомендаций нет');
  });

  describe('recommendations', () => {
    it('should offer an ECG to a patient over 40 and not to a younger one', async () => {
      loadAll({ patient: { birthDate: '1985-03-14' } });
      const { unmount } = renderWithClient(<HomeView />);
      expect(await screen.findByTestId('reco-ecg')).toHaveTextContent('ЭКГ раз в год');
      expect(within(screen.getByTestId('reco-ecg')).getByRole('link', { name: 'Записаться на ЭКГ' })).toHaveAttribute('href', '/booking');
      unmount();

      jest.resetAllMocks();
      loadAll();
      renderWithClient(<HomeView />);
      await screen.findByTestId('reco-empty');
      expect(screen.queryByTestId('reco-ecg')).not.toBeInTheDocument();
    });

    it('should suggest a repeat visit after a recent visit with advice and no follow-up, and a referral', async () => {
      loadAll();
      historyMock.mockResolvedValue(pageOf([historyFixture({ date: '2026-10-19T07:00:00Z' })]));
      prescriptionsMock.mockResolvedValue(pageOf([serviceFixture({ id: 's1', status: 'active', display: 'Общий анализ крови' })]));
      renderWithClient(<HomeView />);

      expect(await screen.findByTestId('reco-repeat-visit-enc-1')).toHaveTextContent('По итогам приёма 19 октября 2026 г.');
      expect(screen.getByTestId('reco-referral-s1')).toHaveTextContent('Направление: Общий анализ крови');
    });

    it('should hide a recommendation, remember it per patient and bring it back with "Показать скрытые"', async () => {
      loadAll({ patient: { birthDate: '1985-03-14' } });
      renderWithClient(<HomeView />);

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
      renderWithClient(<HomeView />);

      expect(await screen.findByTestId('reco-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('reco-ecg')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Показать скрытые' })).toBeInTheDocument();
    });

    it('should show a retry for the block when the history fails and keep the rest of the page', async () => {
      loadAll();
      historyMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-31' }));
      renderWithClient(<HomeView />);

      const reco = await screen.findByTestId('profile-recommendations');
      expect(await within(reco).findByTestId('problem-banner')).toHaveTextContent('req-31');
      expect(within(reco).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Здравствуйте, Анна' })).toBeInTheDocument();
      expect(within(await screen.findByTestId('home-hero-empty')).getByText('Ближайших приёмов нет')).toBeInTheDocument();
    });
  });

  describe('failures and sparse data', () => {
    it('should explain that the patient card does not exist yet when /me/patient answers 404', async () => {
      loadAll();
      patientMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND'));
      renderWithClient(<HomeView />);

      expect(await screen.findByTestId('no-patient')).toHaveTextContent('Карточка пациента ещё не создана.');
      expect(screen.getByRole('heading', { level: 1, name: 'Здравствуйте, Анна' })).toBeInTheDocument();
      expect(within(region('Личные данные')).getByRole('progressbar', { name: 'Профиль заполнен на 25 процентов' })).toBeInTheDocument();
      expect(screen.queryByTestId('not-found-state')).not.toBeInTheDocument();
    });

    it('should keep the account and offer a retry for the card when only /me/patient fails, without a completeness', async () => {
      loadAll();
      patientMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-21' }));
      patientMock.mockResolvedValue(patientProfileFixture());
      renderWithClient(<HomeView />);

      const data = await screen.findByRole('region', { name: 'Личные данные' });
      expect(await within(data).findByTestId('problem-banner')).toHaveTextContent('req-21');
      expect(within(data).getByText('Лебедева Анна')).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      await userEvent.click(within(data).getByRole('button', { name: 'Повторить' }));

      expect(await within(data).findByText('Женский')).toBeInTheDocument();
      expect(await screen.findByRole('progressbar', { name: 'Профиль заполнен на 100 процентов' })).toBeInTheDocument();
    });

    it('should show a banner under the greeting when /me fails', async () => {
      loadAll();
      accountMock.mockRejectedValue(apiProblem(500, 'INTERNAL', { requestId: 'req-22' }));
      renderWithClient(<HomeView />);

      expect(await screen.findByRole('heading', { level: 1, name: 'Здравствуйте, Анна' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByTestId('problem-banner').length).toBeGreaterThan(0));
      expect(screen.getAllByTestId('problem-banner')[0]).toHaveTextContent('req-22');
    });

    it('should show loading skeletons while the reads run', () => {
      const never = new Promise<never>(() => undefined);
      for (const mock of [accountMock, patientMock, historyMock, prescriptionsMock, appointmentsMock]) (mock as jest.Mock).mockReturnValue(never);
      renderWithClient(<HomeView />);

      expect(screen.getByRole('heading', { level: 1, name: 'Здравствуйте' })).toBeInTheDocument();
      expect(screen.getAllByTestId('content-skeleton-detail').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByTestId('content-skeleton-timeline').length).toBeGreaterThanOrEqual(1);
    });

    it('should say that the account is disabled when it is', async () => {
      loadAll();
      accountMock.mockResolvedValue(accountFixture({ isActive: false }));
      renderWithClient(<HomeView />);

      expect(await within(await screen.findByRole('region', { name: 'Личные данные' })).findByText('Отключена')).toBeInTheDocument();
    });

    it('should fall back to the parts of the name and an unknown sex when the card is sparse', async () => {
      loadAll();
      accountMock.mockResolvedValue(accountFixture({ name: undefined }));
      patientMock.mockResolvedValue(patientProfileFixture({ fullName: '', middleName: 'Игоревна', gender: undefined, birthDate: undefined, telecom: [] }));
      renderWithClient(<HomeView />);

      const data = await screen.findByRole('region', { name: 'Личные данные' });
      expect(await within(data).findByTestId('profile-name')).toHaveTextContent('Лебедева Анна');
      expect(within(data).getByText('Не указан', { selector: 'dd' })).toBeInTheDocument();
      expect(within(data).queryByText('Дата рождения')).not.toBeInTheDocument();
      expect(within(data).queryByText('Контакты')).not.toBeInTheDocument();
    });
  });

  it('should render in English when the locale is en', async () => {
    useUiStore.setState({ locale: 'en' });
    loadAll();
    renderWithClient(<HomeView />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Анна' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Personal data' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Quick actions' })).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'Personal data' })).findByText('2 November 1992')).toBeInTheDocument();
  });
});
