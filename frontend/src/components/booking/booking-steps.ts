import type { Slot } from '@/components/catalog/catalog-types';
import type { BookingDraft, BookingStep } from '@/store/use-booking-draft-store';

export interface StepDefinition {
  readonly step: BookingStep;
  readonly labelKey: string;
}

export const BOOKING_STEPS: ReadonlyArray<StepDefinition> = [
  { step: 1, labelKey: 'stepService' },
  { step: 2, labelKey: 'stepDoctor' },
  { step: 3, labelKey: 'stepSlot' },
  { step: 4, labelKey: 'stepConfirm' },
];

const NO_SLOT = { slotId: null, slotStart: null, slotEnd: null } as const;

export function selectService(draft: BookingDraft, serviceId: string | null): Partial<BookingDraft> {
  if (draft.serviceId === serviceId) return { step: 2 };
  return { serviceId, doctorId: null, ...NO_SLOT, step: 2 };
}

export function selectDoctor(draft: BookingDraft, doctorId: string): Partial<BookingDraft> {
  if (draft.doctorId === doctorId) return { step: 3 };
  return { doctorId, ...NO_SLOT, step: 3 };
}

export function selectSlot(slot: Pick<Slot, 'id' | 'start' | 'end'>): Partial<BookingDraft> {
  return { slotId: slot.id, slotStart: slot.start, slotEnd: slot.end, step: 4 };
}

export function selectDoctorSlot(doctorId: string, slot: Pick<Slot, 'id' | 'start' | 'end'>): Partial<BookingDraft> {
  return { doctorId, ...selectSlot(slot) };
}

export function draftFromSlot(doctorId: string, slot: Pick<Slot, 'id' | 'start' | 'end'>, serviceId: string | null = null): Partial<BookingDraft> {
  return { serviceId, doctorId, reason: '', ...selectSlot(slot) };
}

export function draftForDoctor(doctorId: string): Partial<BookingDraft> {
  return { serviceId: null, doctorId, ...NO_SLOT, reason: '', step: 3 };
}

function isPast(iso: string | null, now: number): boolean {
  if (iso === null) return false;
  const start: number = Date.parse(iso);
  return Number.isFinite(start) && start <= now;
}

function supportedStep(draft: BookingDraft, slotUsable: boolean): BookingStep {
  if (draft.step === 4 && !slotUsable) return draft.doctorId === null ? 2 : 3;
  if (draft.step === 3 && draft.doctorId === null) return 2;
  return draft.step;
}

export function repairDraft(draft: BookingDraft, now: number = Date.now()): Partial<BookingDraft> | null {
  const slotExpired: boolean = draft.slotId !== null && isPast(draft.slotStart, now);
  const slotUsable: boolean = draft.slotId !== null && !slotExpired;
  const step: BookingStep = supportedStep(draft, slotUsable);
  if (!slotExpired && step === draft.step) return null;
  return { ...(slotExpired ? NO_SLOT : {}), step };
}
