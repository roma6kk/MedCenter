import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type BookingStep = 1 | 2 | 3 | 4;

export interface BookingDraft {
  readonly serviceId: string | null;
  readonly doctorId: string | null;
  readonly slotId: string | null;
  readonly slotStart: string | null;
  readonly slotEnd: string | null;
  readonly step: BookingStep;
  readonly idempotencyKey: string | null;
}

interface BookingDraftStore extends BookingDraft {
  updateDraft: (patch: Partial<BookingDraft>) => void;
  ensureIdempotencyKey: () => string;
  releaseSlot: () => void;
  clearDraft: () => void;
}

const INITIAL: BookingDraft = {
  serviceId: null,
  doctorId: null,
  slotId: null,
  slotStart: null,
  slotEnd: null,
  step: 1,
  idempotencyKey: null,
};

export const BOOKING_DRAFT_KEY = 'booking-draft';

const INTENT_FIELDS: ReadonlyArray<keyof BookingDraft> = ['serviceId', 'slotId'];

function changesIntent(state: BookingDraft, patch: Partial<BookingDraft>): boolean {
  return INTENT_FIELDS.some((field) => field in patch && patch[field] !== state[field]);
}

function withIntentReset(state: BookingDraft, patch: Partial<BookingDraft>): Partial<BookingDraft> {
  const resetsKey = changesIntent(state, patch) && !('idempotencyKey' in patch);
  return resetsKey ? { ...patch, idempotencyKey: null } : patch;
}

// sessionStorage does not exist during SSR; touching it at store creation crashes the prerender.
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

// The Idempotency-Key is part of the draft: the server refuses the same key with a different body (409), so it is dropped when the body changes.
export const useBookingDraftStore = create<BookingDraftStore>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      updateDraft: (patch) => set((state) => withIntentReset(state, patch)),
      ensureIdempotencyKey: () => {
        const existing: string | null = get().idempotencyKey;
        if (existing !== null) return existing;
        const created = crypto.randomUUID();
        set({ idempotencyKey: created });
        return created;
      },
      releaseSlot: () => set({ slotId: null, slotStart: null, slotEnd: null, idempotencyKey: null, step: 3 }),
      clearDraft: () => set({ ...INITIAL }),
    }),
    {
      name: BOOKING_DRAFT_KEY,
      storage: createJSONStorage(resolveStorage),
      partialize: (state): BookingDraft => ({
        serviceId: state.serviceId,
        doctorId: state.doctorId,
        slotId: state.slotId,
        slotStart: state.slotStart,
        slotEnd: state.slotEnd,
        step: state.step,
        idempotencyKey: state.idempotencyKey,
      }),
    },
  ),
);
