import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as doctorApi from '@/components/doctor/doctor-api';
import * as api from './consent-api';
import { NONE, WITH_ACTIVE } from './consent-fixtures';
import { ConsentManagementSection, useConsentManagement } from './consent-management-section';

jest.mock('./consent-api');
jest.mock('@/components/doctor/doctor-api');

function Harness(): React.ReactNode {
  const management = useConsentManagement();
  return (
    <>
      <button type="button" onClick={management.reveal}>reveal</button>
      <ConsentManagementSection patientId="p1" management={management} />
    </>
  );
}

describe('ConsentManagementSection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    window.location.hash = '';
    jest.mocked(api.fetchPatientConsent).mockResolvedValue(WITH_ACTIVE);
    jest.mocked(doctorApi.fetchRelatedPersons).mockResolvedValue(pageOf([]));
  });

  it('should be folded by default: no forms and no consent request until it is opened', async () => {
    renderWithClient(<Harness />);

    expect(screen.getByRole('button', { name: 'Управление согласием', expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записать отзыв' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('should open on the heading button and fold again', async () => {
    renderWithClient(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Управление согласием' }));
    expect(await screen.findByText('Согласие действует')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Управление согласием', expanded: true })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Управление согласием' }));
    expect(screen.queryByText('Согласие действует')).not.toBeInTheDocument();
  });

  it('should open and take the focus when the head of the page asks for it', async () => {
    jest.mocked(api.fetchPatientConsent).mockResolvedValue(NONE);
    renderWithClient(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'reveal' }));

    expect(await screen.findByRole('form', { name: 'Внести бумажное согласие или отказ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Управление согласием' })).toHaveFocus();
  });

  it('should open on arrival when the address carries the #consent anchor', async () => {
    window.location.hash = '#consent';
    renderWithClient(<Harness />);

    expect(await screen.findByText('Согласие действует')).toBeInTheDocument();
  });

  it('should open when the anchor appears while the page is open', async () => {
    renderWithClient(<Harness />);

    act(() => {
      window.location.hash = '#consent';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByText('Согласие действует')).toBeInTheDocument();
  });
});
