import { screen, within } from '@testing-library/react';
import { apiProblem, pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as doctorApi from '@/components/doctor/doctor-api';
import * as api from './consent-api';
import { NONE, REVOKED, WITH_ACTIVE } from './consent-fixtures';
import { StaffConsentPanel } from './staff-consent-panel';

jest.mock('./consent-api');
jest.mock('@/components/doctor/doctor-api');
const mocked = jest.mocked(api);

describe('StaffConsentPanel', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    jest.mocked(doctorApi.fetchRelatedPersons).mockResolvedValue(pageOf([]));
  });

  it('should show an active consent, its history and a scan download, and offer the revocation, to a doctor', async () => {
    mocked.fetchPatientConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<StaffConsentPanel patientId="p1" role="DOCTOR" />);

    const panel = await screen.findByRole('region', { name: 'Согласие на электронную медкарту' });
    expect(await within(panel).findByText('Согласие действует')).toBeInTheDocument();
    expect(mocked.fetchPatientConsent).toHaveBeenCalledWith('p1', expect.anything());
    expect(within(panel).getByRole('button', { name: 'Скачать скан формы Ф-12' })).toBeInTheDocument();
    expect(within(panel).getByRole('form', { name: 'Записать отзыв' })).toBeInTheDocument();
    expect(within(panel).getByRole('form', { name: 'Внести бумажное согласие или отказ' })).toBeInTheDocument();
    expect(within(panel).queryByText(/медицинских данных пациента этот раздел не показывает/)).not.toBeInTheDocument();
  });

  it('should tell an administrator that the section holds no medical data', async () => {
    mocked.fetchPatientConsent.mockResolvedValue(NONE);
    renderWithClient(<StaffConsentPanel patientId="p1" role="ADMIN" />);

    expect(await screen.findByText(/медицинских данных пациента этот раздел не показывает/)).toBeInTheDocument();
  });

  it.each([
    ['no consent', NONE],
    ['a revoked consent', REVOKED],
  ])('should offer the recording form but no revocation when there is %s', async (_name, consent) => {
    mocked.fetchPatientConsent.mockResolvedValue(consent);
    renderWithClient(<StaffConsentPanel patientId="p1" role="DOCTOR" />);

    expect(await screen.findByRole('form', { name: 'Внести бумажное согласие или отказ' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Записать отзыв' })).not.toBeInTheDocument();
  });

  it('should show the failure with a retry and no forms when the consent cannot be read', async () => {
    mocked.fetchPatientConsent.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    renderWithClient(<StaffConsentPanel patientId="p1" role="DOCTOR" />);

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});
