import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { ApiError } from '@/lib/api/api-fetch';
import { networkProblem } from '@/lib/api/problem-parse';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useToastStore } from '@/store/use-toast-store';
import { postBodies, postKeys, problem, reachConfirmation, renderWizard, serveApi, serveOutcomes } from './booking-test-utils';


describe('BookingWizard booking', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPush.mockReset();
    useBookingDraftStore.getState().clearDraft();
    useToastStore.getState().clear();
    serveApi();
  });

  it('should book the slot with the service, the reason and an idempotency key, then open the appointment when the visitor confirms', async () => {
    renderWizard();
    await reachConfirmation();

    await userEvent.type(screen.getByLabelText(/Причина обращения/), ' Болит спина ');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/appointments/appt-1'));
    expect(postBodies()).toEqual([{ slotId: 'slot-30', serviceId: 'svc-30', reason: 'Болит спина' }]);
    expect(postKeys()[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });

  it('should show the success state when the booking is created and the appointment page is still opening', async () => {
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('booking-success')).toHaveTextContent('Запись создана');
    expect(screen.getByRole('link', { name: 'Открыть запись' })).toHaveAttribute('href', '/appointments/appt-1');
  });

  it('should not name a patient in the request when the booking is sent', async () => {
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(postBodies()).toHaveLength(1));
    expect(Object.keys(postBodies()[0] as object)).not.toContain('patient');
  });

  it('should not call the API when the reason is shorter than three characters', async () => {
    renderWizard();
    await reachConfirmation();

    await userEvent.type(screen.getByLabelText(/Причина обращения/), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByText('Причина — не короче 3 символов')).toBeInTheDocument();
    expect(postBodies()).toHaveLength(0);
  });

  it('should move focus to the reason field when the reason is too short and the visitor confirms', async () => {
    renderWizard();
    await reachConfirmation();
    const reason: HTMLElement = screen.getByLabelText(/Причина обращения/);

    await userEvent.type(reason, 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(reason).toHaveFocus());
    expect(reason).toHaveAttribute('aria-invalid', 'true');
  });

  it('should send the same idempotency key again when the retry follows a server failure', async () => {
    serveOutcomes(
      () => Promise.reject(new ApiError(problem({ status: 500, errorCode: 'INTERNAL', requestId: 'req-7' }))),
      () => Promise.resolve({ id: 'appt-2' }),
    );
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-7');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/appointments/appt-2'));
    expect(postKeys()).toHaveLength(2);
    expect(postKeys()[1]).toBe(postKeys()[0]);
  });

  it('should keep focus on the confirm button and send one request when the booking is in flight and the visitor presses it again', async () => {
    let finish: (value: unknown) => void = () => undefined;
    serveApi(() => new Promise((resolve) => { finish = resolve; }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    const busy: HTMLElement = await screen.findByRole('button', { name: 'Записываем…' });
    await userEvent.click(busy);

    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    expect(postBodies()).toHaveLength(1);
    await act(async () => finish({ id: 'appt-3' }));
  });

  it('should keep focus on the confirm button when the booking fails and the button opens again', async () => {
    serveOutcomes(() => Promise.reject(new ApiError(problem({ status: 500, errorCode: 'INTERNAL' }))));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toHaveFocus();
  });

  it('should close the button for the Retry-After period and then send the same idempotency key when the server answers 429', async () => {
    serveOutcomes(
      () => Promise.reject(new ApiError(problem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 1 }))),
      () => Promise.resolve({ id: 'appt-4' }),
    );
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    const waiting: HTMLElement = await screen.findByRole('button', { name: 'Повторить через 1 с' });
    await userEvent.click(waiting);

    expect(waiting).toHaveAttribute('aria-disabled', 'true');
    expect(postBodies()).toHaveLength(1);
    const open: HTMLElement = await screen.findByRole('button', { name: 'Подтвердить запись' }, { timeout: 3000 });
    expect(open).not.toHaveAttribute('aria-disabled');
    await userEvent.click(open);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/appointments/appt-4'));
    expect(postKeys()).toHaveLength(2);
    expect(postKeys()[1]).toBe(postKeys()[0]);
  });

  it('should send the same idempotency key again when the retry follows a lost connection', async () => {
    serveOutcomes(() => Promise.reject(new ApiError(networkProblem())), () => Promise.resolve({ id: 'appt-5' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/appointments/appt-5'));
    expect(postKeys()).toHaveLength(2);
    expect(postKeys()[1]).toBe(postKeys()[0]);
  });
});
