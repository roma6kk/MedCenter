import { screen, within } from '@testing-library/react';
import { pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as doctorApi from '@/components/doctor/doctor-api';
import { useSessionStore } from '@/store/use-session-store';
import { AdminPatientConsent } from './admin-patient-consent';
import * as api from './consent-api';
import { rememberPatientNames } from '@/lib/admin-patient-names';
import { NONE, WITH_ACTIVE } from './consent-fixtures';

jest.mock('./consent-api');
jest.mock('@/components/doctor/doctor-api');

describe('AdminPatientConsent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    window.sessionStorage.clear();
    useSessionStore.setState({ role: 'ADMIN' });
    jest.mocked(api.fetchPatientConsent).mockResolvedValue(WITH_ACTIVE);
    jest.mocked(doctorApi.fetchRelatedPersons).mockResolvedValue(pageOf([]));
  });

  it('should show the consent paperwork of the patient for an administrator, with a way back to the users', async () => {
    jest.mocked(api.fetchPatientConsent).mockResolvedValue(NONE);
    renderWithClient(<AdminPatientConsent patientId="p-77" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Согласие на внесение сведений в информационную систему клиники' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К пользователям' })).toHaveAttribute('href', '/admin/users');
    const panel = await screen.findByRole('region', { name: 'Согласие на внесение сведений в информационную систему клиники' });
    expect(await within(panel).findByText('Согласие не оформлено')).toBeInTheDocument();
    expect(within(panel).getByLabelText(/ФИО медработника/)).toBeInTheDocument();
    expect(screen.getByText(/медицинских данных пациента этот раздел не показывает/)).toBeInTheDocument();
  });

  it('should name the patient the administrator opened from the user list, and say so when the name is unknown', async () => {
    rememberPatientNames([{ patientId: 'p-77', name: 'Иванова Мария' }]);
    const { unmount } = renderWithClient(<AdminPatientConsent patientId="p-77" />);

    expect(await screen.findByText('Согласие на ведение записей в ИС клиники: Иванова Мария')).toBeInTheDocument();
    unmount();
    renderWithClient(<AdminPatientConsent patientId="p-99" />);

    expect(await screen.findByText(/Имя пациента неизвестно на этой странице/)).toBeInTheDocument();
  });

  it('should leave the recording form out while a consent is in force, whoever looks', async () => {
    renderWithClient(<AdminPatientConsent patientId="p-77" />);

    await screen.findByText('Согласие действует');
    expect(screen.queryByLabelText(/ФИО медработника/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записать отзыв' })).toBeInTheDocument();
  });

  it('should read nothing medical about the patient (ADR-018): no card, history or prescriptions', async () => {
    renderWithClient(<AdminPatientConsent patientId="p-77" />);

    await screen.findByText('Согласие действует');
    expect(api.fetchPatientConsent).toHaveBeenCalledWith('p-77', expect.anything());
    expect(doctorApi.fetchPatient).not.toHaveBeenCalled();
    expect(doctorApi.fetchPatientHistory).not.toHaveBeenCalled();
    expect(doctorApi.fetchPatientPrescriptions).not.toHaveBeenCalled();
  });
});
