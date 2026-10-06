import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { BookingWizard } from './booking-wizard';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import type { ProblemDetails } from '@/lib/api/problem';

import type { ReactNode } from 'react';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function slotResponse(): { items: ReadonlyArray<{ id: string; start: string; status: string }> } {
  return { items: [{ id: 'slot-1', start: '2026-06-01T07:00:00.000Z', status: 'free' }] };
}

function renderWizard(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<BookingWizard />, { wrapper: Wrapper });
}

function postIdempotencyKeys(): ReadonlyArray<unknown> {
  return apiFetchMock.mock.calls
    .filter((call) => call[1]?.method === 'POST')
    .map((call) => (call[1]?.headers as Record<string, string> | undefined)?.['Idempotency-Key']);
}

describe('BookingWizard idempotency', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useBookingDraftStore.getState().clearDraft();
  });

  it('should send a single Idempotency-Key header when booking a selected slot', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ id: 'appt-1' });
      return Promise.resolve(slotResponse());
    });
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(1));
    expect(postIdempotencyKeys()[0]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('should persist the generated key into the draft so a retry reuses it', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.reject(new ApiError({ title: 'Conflict', status: 409, errorCode: 'SLOT_CONFLICT' } as ProblemDetails));
      return Promise.resolve(slotResponse());
    });
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    const confirm = screen.getByRole('button', { name: 'Подтвердить запись' });
    await userEvent.click(confirm);
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(1));

    const persisted = useBookingDraftStore.getState().idempotencyKey;
    expect(persisted).not.toBeNull();

    await userEvent.click(confirm);
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(2));
    expect(postIdempotencyKeys()[1]).toBe(persisted);
    expect(new Set(postIdempotencyKeys()).size).toBe(1);
  });

  it('should show the conflict toast and keep the draft on SLOT_CONFLICT', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.reject(new ApiError({ title: 'Conflict', status: 409, errorCode: 'SLOT_CONFLICT' } as ProblemDetails));
      return Promise.resolve(slotResponse());
    });
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('slot-conflict-toast')).toBeInTheDocument();
    expect(useBookingDraftStore.getState().slotId).toBe('slot-1');
  });

  it('should clear the draft and show success after a created appointment', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ id: 'appt-1' });
      return Promise.resolve(slotResponse());
    });
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    expect(await screen.findByTestId('booking-success')).toBeInTheDocument();
    expect(useBookingDraftStore.getState().idempotencyKey).toBeNull();
    expect(useBookingDraftStore.getState().slotId).toBeNull();
  });

  it('should keep the confirm button disabled until a slot is selected', async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve(slotResponse()));
    renderWizard();

    await screen.findByTestId('slot-slot-1');
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeDisabled();
    expect(apiFetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  });

  it('should reuse the persisted key after a remount so a reloaded retry stays idempotent', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.reject(new ApiError({ title: 'Conflict', status: 409, errorCode: 'SLOT_CONFLICT' } as ProblemDetails));
      return Promise.resolve(slotResponse());
    });
    const first = renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(1));
    const persisted = postIdempotencyKeys()[0];

    first.unmount();
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(2));
    expect(postIdempotencyKeys()[1]).toBe(persisted);
  });

  it('should generate a fresh key for a new booking once the previous draft cleared', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve({ id: 'appt-1' });
      return Promise.resolve(slotResponse());
    });
    renderWizard();

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(1));

    await userEvent.click(await screen.findByTestId('slot-slot-1'));
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));
    await waitFor(() => expect(postIdempotencyKeys()).toHaveLength(2));
    expect(postIdempotencyKeys()[1]).not.toBe(postIdempotencyKeys()[0]);
  });
});
