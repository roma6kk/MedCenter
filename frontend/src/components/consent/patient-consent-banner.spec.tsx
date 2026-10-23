import { screen, waitFor } from '@testing-library/react';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as api from './consent-api';
import { NONE, REJECTED, REVOKED, WITH_ACTIVE } from './consent-fixtures';
import { PatientConsentBanner } from './patient-consent-banner';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

describe('PatientConsentBanner', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it.each([
    ['none', NONE, 'Нет действующего согласия на электронную медкарту'],
    ['revoked', REVOKED, 'Согласие на электронную медкарту отозвано'],
    ['rejected', REJECTED, 'Пациент письменно отказался от электронной медкарты'],
  ])('should warn the doctor up front when the consent is %s, with the way to record it', async (_name, consent, title) => {
    mocked.fetchPatientConsent.mockResolvedValue(consent);
    renderWithClient(<PatientConsentBanner patientId="p1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(title);
    expect(screen.getByRole('alert')).toHaveTextContent('как экстренную помощь');
    expect(screen.getByRole('link', { name: 'Оформить согласие' })).toHaveAttribute('href', '#consent');
  });

  it('should show nothing when the consent is in force', async () => {
    mocked.fetchPatientConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<PatientConsentBanner patientId="p1" />);

    await waitFor(() => expect(mocked.fetchPatientConsent).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should show nothing while loading or when the consent cannot be read (the panel below reports that)', async () => {
    mocked.fetchPatientConsent.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    const { container } = renderWithClient(<PatientConsentBanner patientId="p1" />);

    expect(container).toBeEmptyDOMElement();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
