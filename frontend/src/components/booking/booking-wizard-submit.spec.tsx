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
import { postBodies, postKeys, problem, reachConfirmation, renderBookingScreen, renderConfirmation, serveApi, serveOutcomes } from './booking-test-utils';


async function expectBookedAgainWithSameKey(appointmentId: string): Promise<void> {
  expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
  expect(screen.getByTestId('success-cancel-link')).toHaveAttribute('href', `/appointments/${appointmentId}`);
  expect(postKeys()).toHaveLength(2);
  expect(postKeys()[1]).toBe(postKeys()[0]);
}

describe('BookingWizard booking', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPush.mockReset();
    useBookingDraftStore.getState().clearDraft();
    useToastStore.getState().clear();
    serveApi();
  });

  it('should book the slot with the service and an idempotency key, then show the success screen when the visitor confirms', async () => {
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
    expect(screen.getByTestId('success-cancel-link')).toHaveAttribute('href', '/appointments/appt-1');
    expect(postBodies()).toEqual([{ slotId: 'slot-30', serviceId: 'svc-30' }]);
    expect(postKeys()[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });

  it('should stay on the success screen and not navigate away when the booking is created', async () => {
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('booking-success')).toHaveTextContent('Вы записаны на приём');
    expect(screen.getByRole('link', { name: 'Мои записи' })).toHaveAttribute('href', '/appointments');
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('button', { name: 'Добавить в календарь' })).toBeInTheDocument();
    expect(screen.getByTestId('success-details')).toHaveTextContent('Иванова Мария');
    expect(screen.getByTestId('success-details')).toHaveTextContent('Приём терапевта (первичный)');
    expect(screen.getByTestId('success-details')).toHaveTextContent('г. Минск, ул. Здоровья, 12');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should drop the page title and lead above the steps once the success screen is shown', async () => {
    renderBookingScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();
    expect(screen.getByText(/Четыре шага/)).toBeInTheDocument();
    await reachConfirmation();
    expect(screen.getByRole('heading', { level: 1, name: 'Запись на приём' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Запись на приём' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Четыре шага/)).not.toBeInTheDocument();
  });

  it('should not name a patient in the request when the booking is sent', async () => {
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(postBodies()).toHaveLength(1));
    expect(Object.keys(postBodies()[0] as object)).not.toContain('patient');
  });

  it('should offer no field for a reason of the visit', async () => {
    await renderConfirmation();

    expect(screen.queryByLabelText(/Причина обращения/)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should send the same idempotency key again when the retry follows a server failure', async () => {
    serveOutcomes(
      () => Promise.reject(new ApiError(problem({ status: 500, errorCode: 'INTERNAL', requestId: 'req-7' }))),
      () => Promise.resolve({ id: 'appt-2' }),
    );
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-7');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await expectBookedAgainWithSameKey('appt-2');
  });

  it('should keep focus on the confirm button and send one request when the booking is in flight and the visitor presses it again', async () => {
    let finish: (value: unknown) => void = () => undefined;
    serveApi(() => new Promise((resolve) => { finish = resolve; }));
    await renderConfirmation();

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
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toHaveFocus();
  });

  it('should close the button for the Retry-After period and then send the same idempotency key when the server answers 429', async () => {
    serveOutcomes(
      () => Promise.reject(new ApiError(problem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 1 }))),
      () => Promise.resolve({ id: 'appt-4' }),
    );
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    const waiting: HTMLElement = await screen.findByRole('button', { name: 'Повторить через 1 с' });
    await userEvent.click(waiting);

    expect(waiting).toHaveAttribute('aria-disabled', 'true');
    expect(postBodies()).toHaveLength(1);
    const open: HTMLElement = await screen.findByRole('button', { name: 'Подтвердить запись' }, { timeout: 3000 });
    expect(open).not.toHaveAttribute('aria-disabled');
    await userEvent.click(open);
    await expectBookedAgainWithSameKey('appt-4');
  });

  it('should send the same idempotency key again when the retry follows a lost connection', async () => {
    serveOutcomes(() => Promise.reject(new ApiError(networkProblem())), () => Promise.resolve({ id: 'appt-5' }));
    await renderConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await expectBookedAgainWithSameKey('appt-5');
  });
  it('should start a fresh wizard with an empty draft when the visitor presses «Записаться ещё» on the success screen', async () => {
    await renderConfirmation();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Записаться ещё' }));

    expect(screen.queryByTestId('booking-success')).not.toBeInTheDocument();
    expect(useBookingDraftStore.getState().step).toBe(1);
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });

  it('should send nothing and return to the slot step when the chosen time has started before the visitor confirms', async () => {
    await renderConfirmation();
    const later: number = Date.now() + 10 * 24 * 3600 * 1000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    now.mockRestore();

    expect(await screen.findByTestId('slot-conflict-notice')).toHaveTextContent('Это время уже наступило');
    expect(postBodies()).toHaveLength(0);
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });
});
