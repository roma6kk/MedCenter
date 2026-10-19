import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { ApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useToastStore } from '@/store/use-toast-store';
import type { Slot } from '@/components/catalog/catalog-types';
import { DAY, SLOT_30, apiFetchMock, postKeys, problem, reachConfirmation, renderWizard, serveOutcomes } from './booking-test-utils';

const LATER_SLOT: Slot = { id: 'slot-31', start: `${DAY}T10:00:00.000Z`, end: `${DAY}T10:30:00.000Z`, status: 'free' };

/** From now on the slot search also lists a later slot of the same length: what the refetch after a refusal finds. */
function offerLaterSlot(): void {
  const serve = apiFetchMock.getMockImplementation();
  apiFetchMock.mockImplementation((path, options) => {
    if (path.startsWith('/api/v1/doctors/doc-1/slots')) {
      return Promise.resolve({ doctorId: 'doc-1', from: DAY, to: DAY, items: [SLOT_30, LATER_SLOT] });
    }
    return serve === undefined ? Promise.reject(new Error('no handler')) : serve(path, options);
  });
}

describe('BookingWizard slot conflict', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPush.mockReset();
    useBookingDraftStore.getState().clearDraft();
    useToastStore.getState().clear();
  });

  function serveConflict(first: ProblemDetails): void {
    serveOutcomes(() => Promise.reject(new ApiError(first)), () => Promise.resolve({ id: 'appt-9' }));
  }

  it('should stay on the slot step, say the slot was taken and refetch the slots when the server answers SLOT_CONFLICT', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();
    const slotSearches = (): number => apiFetchMock.mock.calls.filter(([path]) => path.includes('/slots')).length;
    const before: number = slotSearches();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('slot-conflict-notice')).toHaveTextContent('Это время только что заняли');
    expect(screen.getByRole('heading', { name: 'Выберите время' })).toBeInTheDocument();
    await waitFor(() => expect(slotSearches()).toBeGreaterThan(before));
  });

  it('should raise the "slot taken" toast through the central error effects when the booking is refused with SLOT_CONFLICT', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Слот уже занят'));
  });

  it('should draw the refused slot as taken and keep the other choices when the booking is refused', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('slot-slot-30')).toHaveAttribute('data-state', 'taken');
    const draft = useBookingDraftStore.getState();
    expect([draft.slotId, draft.doctorId, draft.serviceId]).toEqual([null, 'doc-1', 'svc-30']);
  });

  it('should drop the idempotency key of the intent when its slot is refused', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await screen.findByTestId('slot-conflict-notice');

    expect(postKeys()[0]).toBeDefined();
    expect(useBookingDraftStore.getState().idempotencyKey).toBeNull();
  });

  it('should put focus on the refusal alert when a booking is refused, so a keyboard visitor keeps their place', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    const notice: HTMLElement = await screen.findByTestId('slot-conflict-notice');

    await waitFor(() => expect(notice).toHaveFocus());
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Выберите время' })).not.toHaveFocus();
  });

  it.each([
    ['the slot belongs to another service', problem({ status: 400, detail: 'serviceId does not match the schedule of this slot' })],
    ['the slot no longer exists', problem({ status: 404, errorCode: 'NOT_FOUND' })],
  ])('should put focus on the refusal alert when %s', async (_name, refusal) => {
    serveConflict(refusal);
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(screen.getByTestId('slot-conflict-notice')).toHaveFocus());
  });

  it('should move focus to the heading of the next step when the visitor picks another slot after a refusal', async () => {
    serveConflict(problem({ status: 409, errorCode: 'SLOT_CONFLICT' }));
    renderWizard();
    await reachConfirmation();
    offerLaterSlot();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await screen.findByTestId('slot-conflict-notice');

    await userEvent.click(await screen.findByTestId(`slot-${LATER_SLOT.id}`));

    expect(screen.queryByTestId('slot-conflict-notice')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Проверьте данные записи' })).toHaveFocus());
  });

  it('should send the visitor back to the slot step when the slot belongs to another service', async () => {
    serveConflict(problem({ status: 400, detail: 'serviceId does not match the schedule of this slot' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('slot-conflict-notice')).toHaveTextContent('относится к другой услуге');
  });

  it('should send the visitor back to the slot step when the slot no longer exists', async () => {
    serveConflict(problem({ status: 404, errorCode: 'NOT_FOUND' }));
    renderWizard();
    await reachConfirmation();

    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('slot-conflict-notice')).toHaveTextContent('уже занято');
  });
});

