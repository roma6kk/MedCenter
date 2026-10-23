import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, newQueryClient, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import * as api from './consent-api';
import { NONE, REJECTED, REVOKED, WITH_ACTIVE } from './consent-fixtures';
import { MyConsentSection } from './my-consent-section';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

describe('MyConsentSection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should tell the patient how to sign the consent at the front desk and offer no revoke when there is none', async () => {
    mocked.fetchMyConsent.mockResolvedValue(NONE);
    renderWithClient(<MyConsentSection />);

    expect(await screen.findByText('Согласие не оформлено')).toBeInTheDocument();
    expect(screen.getByText(/обратитесь в регистратуру с паспортом/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Согласие на электронную медкарту' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать согласие' })).not.toBeInTheDocument();
  });

  it('should show an active consent with its date and form number, the history, and the revoke button', async () => {
    mocked.fetchMyConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<MyConsentSection />);

    expect(await screen.findByText('Согласие действует')).toBeInTheDocument();
    expect(screen.getAllByText('Форма № Ф-12').length).toBeGreaterThan(0);
    expect(screen.getByRole('list', { name: 'История' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отозвать согласие' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Скачать скан/ })).not.toBeInTheDocument();
  });

  it.each([
    ['revoked', REVOKED, 'Согласие отозвано', /Новые записи в карту не вносятся/],
    ['rejected', REJECTED, 'Оформлен письменный отказ', /Если вы передумали/],
  ])('should explain a %s consent and offer no revoke', async (_name, consent, headline, how) => {
    mocked.fetchMyConsent.mockResolvedValue(consent);
    renderWithClient(<MyConsentSection />);

    expect(await screen.findByText(headline)).toBeInTheDocument();
    expect(screen.getByText(how)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать согласие' })).not.toBeInTheDocument();
  });

  it('should show a failure with a retry when the consent cannot be read', async () => {
    mocked.fetchMyConsent.mockRejectedValue(apiProblem(500, 'INTERNAL'));
    renderWithClient(<MyConsentSection />);

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
  });

  it('should explain what revoking does in a dialog before it sends anything, and send nothing when kept', async () => {
    mocked.fetchMyConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<MyConsentSection />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отозвать согласие' }));

    const dialog = await screen.findByRole('dialog', { name: 'Отозвать согласие?' });
    expect(dialog).toHaveTextContent('перестанут вносить новые записи');
    expect(dialog).toHaveTextContent('Уже внесённые записи не удаляются');
    expect(dialog).toHaveTextContent('письменным заявлением в клинике');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Оставить согласие' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocked.postMyConsentRevoke).not.toHaveBeenCalled();
  });

  it('should close the dialog on Escape without revoking', async () => {
    mocked.fetchMyConsent.mockResolvedValue(WITH_ACTIVE);
    renderWithClient(<MyConsentSection />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отозвать согласие' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocked.postMyConsentRevoke).not.toHaveBeenCalled();
  });

  it('should revoke, refresh the status, close the dialog and say the written application is still needed', async () => {
    mocked.fetchMyConsent.mockResolvedValueOnce(WITH_ACTIVE).mockResolvedValue(REVOKED);
    mocked.postMyConsentRevoke.mockResolvedValue({ ...WITH_ACTIVE.history[0]!, status: 'inactive' });
    const client = newQueryClient();
    renderWithClient(<MyConsentSection />, client);

    await userEvent.click(await screen.findByRole('button', { name: 'Отозвать согласие' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отозвать согласие' }));

    expect(await screen.findByText('Согласие отозвано')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocked.postMyConsentRevoke).toHaveBeenCalledTimes(1);
    expect(mocked.fetchMyConsent).toHaveBeenCalledTimes(2);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Согласие отозвано. Подтвердите отзыв письменным заявлением в клинике.');
  });

  it('should keep the dialog open and show the problem when the revocation fails', async () => {
    mocked.fetchMyConsent.mockResolvedValue(WITH_ACTIVE);
    mocked.postMyConsentRevoke.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-9' }));
    renderWithClient(<MyConsentSection />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отозвать согласие' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Отозвать согласие' }));

    expect(await within(dialog).findByTestId('problem-banner')).toHaveTextContent('req-9');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
