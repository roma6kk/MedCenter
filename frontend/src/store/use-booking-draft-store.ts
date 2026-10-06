import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface BookingDraft {
  readonly doctorId: string | null;
  readonly serviceId: string | null;
  readonly slotId: string | null;
  readonly step: number;
  readonly idempotencyKey: string | null;
}

interface BookingDraftStore extends BookingDraft {
  updateDraft: (patch: Partial<BookingDraft>) => void;
  clearDraft: () => void;
}

const INITIAL: BookingDraft = {
  doctorId: null,
  serviceId: null,
  slotId: null,
  step: 1,
  idempotencyKey: null,
};

export const BOOKING_DRAFT_KEY = 'booking-draft';

/**
 * Server-side no-op storage — `sessionStorage` does not exist during SSR,
 * and touching it at store creation crashes the prerender (frontend review).
 */
const noopStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

function resolveStorage(): Storage {
  return typeof window === 'undefined' ? noopStorage : window.sessionStorage;
}

export const useBookingDraftStore = create<BookingDraftStore>()(
  persist(
    (set) => ({
      ...INITIAL,
      updateDraft: (patch) => set((state) => ({ ...state, ...patch })),
      clearDraft: () => set({ ...INITIAL }),
    }),
    { name: BOOKING_DRAFT_KEY, storage: createJSONStorage(resolveStorage) },
  ),
);
