import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Wizard steps of frontend-design-spec §3: 1 service, 2 doctor, 3 slot, 4 confirmation. */
export type BookingStep = 1 | 2 | 3 | 4;

export interface BookingDraft {
  readonly serviceId: string | null;
  readonly doctorId: string | null;
  readonly slotId: string | null;
  /** RFC 3339 start/end of the chosen slot: the confirmation step shows them without another request. */
  readonly slotStart: string | null;
  readonly slotEnd: string | null;
  /** Optional reason of the visit (3…500 characters, validated by the confirmation step). */
  readonly reason: string;
  readonly step: BookingStep;
  readonly idempotencyKey: string | null;
}

interface BookingDraftStore extends BookingDraft {
  updateDraft: (patch: Partial<BookingDraft>) => void;
  /** The key of the current booking intent; created on first use and reused by every retry of the same request. */
  ensureIdempotencyKey: () => string;
  /** The chosen slot was taken: forget it (and its key), keep everything else and return to the slot step. */
  releaseSlot: () => void;
  clearDraft: () => void;
}

const INITIAL: BookingDraft = {
  serviceId: null,
  doctorId: null,
  slotId: null,
  slotStart: null,
  slotEnd: null,
  reason: '',
  step: 1,
  idempotencyKey: null,
};

export const BOOKING_DRAFT_KEY = 'booking-draft';

/** The fields that make up the `POST /appointments` request body: a change means a different booking intent. */
const INTENT_FIELDS: ReadonlyArray<keyof BookingDraft> = ['serviceId', 'slotId', 'reason'];

function changesIntent(state: BookingDraft, patch: Partial<BookingDraft>): boolean {
  return INTENT_FIELDS.some((field) => field in patch && patch[field] !== state[field]);
}

/** A patch that changes the request body also drops the key: the next attempt is a new intent. */
function withIntentReset(state: BookingDraft, patch: Partial<BookingDraft>): Partial<BookingDraft> {
  const resetsKey: boolean = changesIntent(state, patch) && !('idempotencyKey' in patch);
  return resetsKey ? { ...patch, idempotencyKey: null } : patch;
}

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

/**
 * Booking wizard draft (frontend-design-spec §5.2), persisted in `sessionStorage` so it survives the redirect to the
 * login form and back. The `Idempotency-Key` is part of the draft: the server replays the first successful answer for
 * a key, and refuses the same key with a different body (409), so the key is dropped whenever the request body changes.
 */
export const useBookingDraftStore = create<BookingDraftStore>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      updateDraft: (patch) => set((state) => withIntentReset(state, patch)),
      ensureIdempotencyKey: () => {
        const existing: string | null = get().idempotencyKey;
        if (existing !== null) return existing;
        const created: string = crypto.randomUUID();
        set({ idempotencyKey: created });
        return created;
      },
      releaseSlot: () => set({ slotId: null, slotStart: null, slotEnd: null, idempotencyKey: null, step: 3 }),
      clearDraft: () => set({ ...INITIAL }),
    }),
    {
      name: BOOKING_DRAFT_KEY,
      storage: createJSONStorage(resolveStorage),
      // Actions are not data; only the draft itself goes to storage.
      partialize: (state): BookingDraft => ({
        serviceId: state.serviceId,
        doctorId: state.doctorId,
        slotId: state.slotId,
        slotStart: state.slotStart,
        slotEnd: state.slotEnd,
        reason: state.reason,
        step: state.step,
        idempotencyKey: state.idempotencyKey,
      }),
    },
  ),
);
