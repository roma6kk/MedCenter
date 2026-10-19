import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }), usePathname: () => '/doctors/doc-1' }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from '@/lib/api/api-fetch';
import { shiftDay, todayInClinic } from '@/components/booking/slot-time';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';
import type { Slot } from './catalog-types';
import { DoctorSlotsBooking } from './doctor-slots-booking';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;
const DAY: string = shiftDay(todayInClinic(), 2);
const SLOT: Slot = { id: 'slot-1', start: `${DAY}T08:00:00.000Z`, end: `${DAY}T08:30:00.000Z`, status: 'free' };

function renderBooking(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<DoctorSlotsBooking doctorId="doc-1" />, { wrapper: Wrapper });
}

describe('DoctorSlotsBooking', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
    useSessionStore.getState().clearSession();
    apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', from: DAY, to: DAY, items: [SLOT] });
  });

  it('should not let a visitor book when no time is chosen', async () => {
    renderBooking();

    await screen.findByTestId('slot-slot-1');

    expect(screen.getByRole('button', { name: 'Выберите время' })).toBeDisabled();
  });

  it('should name the chosen time on the button when a slot is chosen', async () => {
    renderBooking();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));

    expect(screen.getByRole('button', { name: /^Записаться на .*11:00/ })).toBeEnabled();
  });

  it('should keep the chosen slot in the draft and open the booking wizard on the confirmation step when the visitor presses book', async () => {
    renderBooking();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: /^Записаться на/ }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/booking'));
    expect(useBookingDraftStore.getState()).toMatchObject({ doctorId: 'doc-1', slotId: 'slot-1', slotStart: SLOT.start, slotEnd: SLOT.end, step: 4, serviceId: null });
  });

  it('should say that only patients can book when a doctor or an administrator looks at the page', async () => {
    useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role: 'DOCTOR', scope: null, patientRef: null, fhirUser: null });
    renderBooking();

    await screen.findByTestId('slot-slot-1');

    expect(screen.getByText('Запись на приём доступна пациентам.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Записаться/ })).not.toBeInTheDocument();
  });
});
