import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useToastStore } from '@/store/use-toast-store';
import { apiFetchMock, chooseSlotStep, renderWizard, serveApi } from './booking-test-utils';


describe('BookingWizard steps', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
    useToastStore.getState().clear();
    serveApi();
  });

  it('should offer the services and an "any service" choice first when the wizard opens', async () => {
    renderWizard();

    expect(await screen.findByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(screen.getByTestId('service-any')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Шаги записи' })).toBeInTheDocument();
  });

  it('should list the doctors of the chosen service when a service is chosen', async () => {
    renderWizard();

    await userEvent.click(await screen.findByTestId('service-svc-30'));

    expect(await screen.findByRole('heading', { name: 'Врачи для услуги «Приём терапевта (первичный)»' })).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/doctors\?.*serviceId=svc-30/));
  });

  it('should list every doctor when no service is chosen', async () => {
    renderWizard();

    await userEvent.click(await screen.findByTestId('service-any'));

    expect(await screen.findByRole('heading', { name: 'Выберите врача' })).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('serviceId'));
  });

  it('should offer only the slots as long as the chosen service when a service is chosen', async () => {
    renderWizard();

    await chooseSlotStep();

    expect(await screen.findByTestId('slot-slot-30')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-slot-20')).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/doctors\/doc-1\/slots\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/));
  });

  it('should show the summary of the booking on the confirmation step when a slot is chosen', async () => {
    renderWizard();

    await chooseSlotStep();
    await userEvent.click(await screen.findByTestId('slot-slot-30'));

    const summary = await screen.findByTestId('booking-summary');
    await waitFor(() => expect(summary).toHaveTextContent('Мария Иванова'));
    expect(summary).toHaveTextContent('Приём терапевта (первичный)');
    expect(summary).toHaveTextContent('30 мин');
  });

  it('should go back to an earlier step when its button in the step list is activated', async () => {
    renderWizard();
    await chooseSlotStep();
    await screen.findByTestId('slot-slot-30');

    await userEvent.click(screen.getByRole('button', { name: /1.*Услуга/ }));

    expect(await screen.findByRole('heading', { name: 'Выберите услугу' })).toBeInTheDocument();
  });

  it('should open the slot step of the doctor when the URL names the doctor', async () => {
    renderWizard('doc-1');

    expect(await screen.findByRole('heading', { name: 'Выберите время' })).toBeInTheDocument();
    expect(await screen.findByTestId('slot-slot-30')).toBeInTheDocument();
  });

  it('should move keyboard focus to the heading of the new step when the wizard moves to another step', async () => {
    renderWizard();

    await userEvent.click(await screen.findByTestId('service-svc-30'));

    const heading = await screen.findByRole('heading', { name: /Врачи для услуги/ });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('should not steal focus when the wizard first opens', async () => {
    renderWizard();

    await screen.findByRole('heading', { name: 'Выберите услугу' });

    expect(screen.getByRole('heading', { name: 'Выберите услугу' })).not.toHaveFocus();
  });
});
