/**
 * booking-steps — the pure rules of the booking wizard (frontend-design-spec §3, §4): which step follows which choice,
 * what a choice makes obsolete, and how a draft restored from `sessionStorage` is made safe to show.
 */
import type { Slot } from '@/components/catalog/catalog-types';
import type { BookingDraft, BookingStep } from '@/store/use-booking-draft-store';

export interface StepDefinition {
  readonly step: BookingStep;
  /** Key inside the `booking` message namespace. */
  readonly labelKey: string;
}

export const BOOKING_STEPS: ReadonlyArray<StepDefinition> = [
  { step: 1, labelKey: 'stepService' },
  { step: 2, labelKey: 'stepDoctor' },
  { step: 3, labelKey: 'stepSlot' },
  { step: 4, labelKey: 'stepConfirm' },
];

const NO_SLOT = { slotId: null, slotStart: null, slotEnd: null } as const;

/** Step 1 → 2. A different service may not be offered by the chosen doctor, so doctor and slot are dropped. */
export function selectService(draft: BookingDraft, serviceId: string | null): Partial<BookingDraft> {
  if (draft.serviceId === serviceId) return { step: 2 };
  return { serviceId, doctorId: null, ...NO_SLOT, step: 2 };
}

/** Step 2 → 3. Another doctor has other times, so the slot is dropped. */
export function selectDoctor(draft: BookingDraft, doctorId: string): Partial<BookingDraft> {
  if (draft.doctorId === doctorId) return { step: 3 };
  return { doctorId, ...NO_SLOT, step: 3 };
}

/** Step 3 → 4. The start/end travel with the draft so the confirmation needs no extra request. */
export function selectSlot(slot: Pick<Slot, 'id' | 'start' | 'end'>): Partial<BookingDraft> {
  return { slotId: slot.id, slotStart: slot.start, slotEnd: slot.end, step: 4 };
}

/** The public doctor page hands a doctor and a slot to the wizard: no service chosen, straight to confirmation. */
export function draftFromSlot(doctorId: string, slot: Pick<Slot, 'id' | 'start' | 'end'>): Partial<BookingDraft> {
  return { serviceId: null, doctorId, reason: '', ...selectSlot(slot) };
}

/** A deep link `/booking?doctorId=…` (the doctor's "book" button without a slot): the doctor is known, the time is not. */
export function draftForDoctor(doctorId: string): Partial<BookingDraft> {
  return { serviceId: null, doctorId, ...NO_SLOT, reason: '', step: 3 };
}

function isPast(iso: string | null, now: number): boolean {
  if (iso === null) return false;
  const start: number = Date.parse(iso);
  return Number.isFinite(start) && start <= now;
}

/** The highest step the draft's data supports. */
function supportedStep(draft: BookingDraft, slotUsable: boolean): BookingStep {
  if (draft.step === 4 && !slotUsable) return draft.doctorId === null ? 2 : 3;
  if (draft.step === 3 && draft.doctorId === null) return 2;
  return draft.step;
}

/**
 * A draft can outlive the moment it was written (a tab left open, a login that took long). Returns the patch that makes
 * it consistent — a slot that has already started is dropped and the wizard falls back to the slot step — or `null`
 * when the draft is fine as it is.
 */
export function repairDraft(draft: BookingDraft, now: number = Date.now()): Partial<BookingDraft> | null {
  const slotExpired: boolean = draft.slotId !== null && isPast(draft.slotStart, now);
  const slotUsable: boolean = draft.slotId !== null && !slotExpired;
  const step: BookingStep = supportedStep(draft, slotUsable);
  if (!slotExpired && step === draft.step) return null;
  return { ...(slotExpired ? NO_SLOT : {}), step };
}
