import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { SLOT_30, postBodies, renderWizard, serveApi } from './booking-test-utils';


describe('BookingWizard draft', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPush.mockReset();
    useBookingDraftStore.getState().clearDraft();
    serveApi();
  });

  it('should open on the confirmation step when the draft was restored after the login', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', slotId: 'slot-30', slotStart: SLOT_30.start, slotEnd: SLOT_30.end, step: 4 });
    renderWizard();

    expect(await screen.findByRole('button', { name: 'Подтвердить запись' })).toBeInTheDocument();
    expect(screen.getByText(/Черновик записи восстановлен/)).toBeInTheDocument();
    expect(await screen.findByTestId('booking-summary')).toHaveTextContent('Мария Иванова');
  });

  it('should book the restored draft without asking for the choices again when the visitor confirms', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', slotId: 'slot-30', slotStart: SLOT_30.start, slotEnd: SLOT_30.end, step: 4 });
    renderWizard();

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/appointments/appt-1'));
    expect(postBodies()).toEqual([{ slotId: 'slot-30' }]);
  });

  it('should fall back to the slot step when the drafted slot has already started', async () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', slotId: 'old', slotStart: '2020-01-01T08:00:00.000Z', slotEnd: '2020-01-01T08:30:00.000Z', step: 4 });
    renderWizard();

    expect(await screen.findByRole('heading', { name: 'Выберите время' })).toBeInTheDocument();
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });
});
