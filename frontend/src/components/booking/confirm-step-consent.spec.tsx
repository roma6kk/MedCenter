import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import * as consentApi from '@/components/consent/consent-api';
import { NONE, REVOKED, WITH_ACTIVE } from '@/components/consent/consent-fixtures';
import { ConfirmStep } from './confirm-step';

jest.mock('@/components/consent/consent-api');
jest.mock('@/components/catalog/use-catalog', () => ({ useDoctor: () => ({ data: undefined }), useService: () => ({ data: undefined }) }));
const mocked = jest.mocked(consentApi);

const BOOKING = { submit: jest.fn(), isPending: false, problem: null, reasonError: null };
const DRAFT = { serviceId: null, doctorId: 'doc-1', slotStart: '2026-11-02T08:00:00.000Z', slotEnd: '2026-11-02T08:30:00.000Z' };

function renderStep(reason = '', onReasonChange: (reason: string) => void = jest.fn()): void {
  renderWithClient(<ConfirmStep draft={{ ...DRAFT, reason }} onReasonChange={onReasonChange} booking={BOOKING} />);
}

describe('ConfirmStep without a consent (6.1, ADR-019)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should keep the reason field usable when the patient has an active consent', async () => {
    mocked.fetchMyConsent.mockResolvedValue(WITH_ACTIVE);
    renderStep();

    await waitFor(() => expect(mocked.fetchMyConsent).toHaveBeenCalled());
    expect(screen.getByLabelText(/Причина обращения/)).toBeEnabled();
    expect(screen.queryByText(/только после оформления согласия/)).not.toBeInTheDocument();
  });

  it.each([['none', NONE], ['revoked', REVOKED]])('should disable the reason field and say why when the consent is %s', async (_name, consent) => {
    mocked.fetchMyConsent.mockResolvedValue(consent);
    renderStep();

    const field = await screen.findByLabelText(/Причина обращения/);
    await waitFor(() => expect(field).toBeDisabled());
    expect(field).toHaveAccessibleDescription(expect.stringContaining('Свободный текст о здоровье можно указать только после оформления согласия'));
  });

  it('should drop a reason already typed into the draft so it is not sent', async () => {
    mocked.fetchMyConsent.mockResolvedValue(NONE);
    const onReasonChange = jest.fn();
    renderStep('Болит голова', onReasonChange);

    await waitFor(() => expect(onReasonChange).toHaveBeenCalledWith(''));
  });

  it('should let the visitor confirm without a reason when there is no consent', async () => {
    mocked.fetchMyConsent.mockResolvedValue(NONE);
    renderStep('Болит голова');

    await waitFor(() => expect(screen.getByLabelText(/Причина обращения/)).toBeDisabled());
    await userEvent.click(screen.getByTestId('booking-confirm'));

    expect(BOOKING.submit).toHaveBeenCalledTimes(1);
  });

  it('should leave the field usable when the consent cannot be read: the server decides', async () => {
    mocked.fetchMyConsent.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    renderStep();

    await waitFor(() => expect(mocked.fetchMyConsent).toHaveBeenCalled());
    expect(screen.getByLabelText(/Причина обращения/)).toBeEnabled();
  });
});
