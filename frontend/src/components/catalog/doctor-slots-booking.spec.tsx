import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }), usePathname: () => '/doctors/doc-1' }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { clinicDateKey, shiftDateKey } from '@/lib/clinic-time';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';
import { apiFetchMock, renderWithCatalog } from './catalog-test-utils';
import type { CatalogService, Slot } from './catalog-types';
import { DoctorSlotsBooking } from './doctor-slots-booking';

const DAY: string = shiftDateKey(clinicDateKey(), 2);
const SLOT: Slot = { id: 'slot-1', start: `${DAY}T08:00:00.000Z`, end: `${DAY}T08:30:00.000Z`, status: 'free' };
const SLOT_40: Slot = { id: 'slot-40', start: `${DAY}T09:00:00.000Z`, end: `${DAY}T09:40:00.000Z`, status: 'free' };
const SVC_30: CatalogService = { id: 'svc-30', name: 'Первичный приём', typeSystem: 's', typeCode: '1', defaultDurationMin: 30, isActive: true };
const SVC_40: CatalogService = { id: 'svc-40', name: 'Расширенный приём', typeSystem: 's', typeCode: '2', defaultDurationMin: 40, isActive: true };

function renderBooking(props: { readonly services?: ReadonlyArray<CatalogService>; readonly servicesPending?: boolean } = {}): void {
  renderWithCatalog(<DoctorSlotsBooking doctorId="doc-1" {...props} />);
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

  it('should offer the services as chips first and show the time of the first one only when the doctor gives several', async () => {
    apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', from: DAY, to: DAY, items: [SLOT, SLOT_40] });
    renderBooking({ services: [SVC_30, SVC_40] });

    expect(screen.getByRole('group', { name: 'Услуга' })).toBeInTheDocument();
    expect(screen.getByTestId('service-chip-svc-30')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('service-chip-svc-40')).toHaveAttribute('aria-pressed', 'false');
    await screen.findByTestId('slot-slot-1');
    expect(screen.queryByTestId('slot-slot-40')).not.toBeInTheDocument();
  });

  it('should switch to the time of the other service, forget the chosen time and book with that service when a chip is pressed', async () => {
    apiFetchMock.mockResolvedValue({ doctorId: 'doc-1', from: DAY, to: DAY, items: [SLOT, SLOT_40] });
    renderBooking({ services: [SVC_30, SVC_40] });
    await userEvent.click(await screen.findByTestId('slot-slot-1'));

    await userEvent.click(screen.getByTestId('service-chip-svc-40'));

    expect(screen.getByRole('button', { name: 'Выберите время' })).toBeDisabled();
    await userEvent.click(await screen.findByTestId('slot-slot-40'));
    await userEvent.click(screen.getByRole('button', { name: /^Записаться на/ }));
    expect(useBookingDraftStore.getState()).toMatchObject({ doctorId: 'doc-1', slotId: 'slot-40', serviceId: 'svc-40', step: 4 });
  });

  it('should hold the time back while the services of the doctor are still being read', () => {
    renderBooking({ servicesPending: true });

    expect(screen.getByTestId('service-chips-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-skeleton')).not.toBeInTheDocument();
  });
});
