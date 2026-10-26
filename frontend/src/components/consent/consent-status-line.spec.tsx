import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as api from './consent-api';
import { NONE, REJECTED, REVOKED, WITH_ACTIVE } from './consent-fixtures';
import { ConsentStatusLine } from './consent-status-line';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

describe('ConsentStatusLine', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should say in one badge that the consent is in force and since when', async () => {
    mocked.fetchPatientConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<ConsentStatusLine patientId="p1" />);

    expect(await screen.findByTestId('consent-line-active')).toHaveTextContent('Согласие на ЭМК · действует с 20.10.2026');
  });

  it.each([
    ['none', NONE, 'Нет согласия на ЭМК'],
    ['revoked', REVOKED, 'Согласие на ЭМК отозвано'],
    ['rejected', REJECTED, 'Письменный отказ от ЭМК'],
  ])('should say so in words when the consent is %s', async (state, consent, text) => {
    mocked.fetchPatientConsent.mockResolvedValue(consent);
    renderWithClient(<ConsentStatusLine patientId="p1" />);

    expect(await screen.findByTestId(`consent-line-${state}`)).toHaveTextContent(text);
  });

  it('should offer the management only to a page that can show it', async () => {
    mocked.fetchPatientConsent.mockResolvedValue(WITH_ACTIVE);
    const onManage = jest.fn();
    const { rerender } = renderWithClient(<ConsentStatusLine patientId="p1" onManage={onManage} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Управление согласием' }));
    expect(onManage).toHaveBeenCalledTimes(1);

    rerender(<ConsentStatusLine patientId="p1" />);
    expect(screen.queryByRole('button', { name: 'Управление согласием' })).not.toBeInTheDocument();
  });

  it('should show nothing when the consent cannot be read', async () => {
    mocked.fetchPatientConsent.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    const { container } = renderWithClient(<ConsentStatusLine patientId="p1" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
