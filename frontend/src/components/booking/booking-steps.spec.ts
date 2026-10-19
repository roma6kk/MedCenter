import type { BookingDraft } from '@/store/use-booking-draft-store';
import { BOOKING_STEPS, draftForDoctor, draftFromSlot, repairDraft, selectDoctor, selectService, selectSlot } from './booking-steps';

const EMPTY: BookingDraft = {
  serviceId: null,
  doctorId: null,
  slotId: null,
  slotStart: null,
  slotEnd: null,
  reason: '',
  step: 1,
  idempotencyKey: null,
};

const SLOT = { id: 'slot-1', start: '2026-10-19T11:00:00.000Z', end: '2026-10-19T11:30:00.000Z' };
const NOW = Date.parse('2026-10-16T12:00:00.000Z');

function draft(patch: Partial<BookingDraft>): BookingDraft {
  return { ...EMPTY, ...patch };
}

describe('BOOKING_STEPS', () => {
  it('should list service, doctor, slot and confirmation in that order when the steps are read', () => {
    expect(BOOKING_STEPS.map((item) => item.labelKey)).toEqual(['stepService', 'stepDoctor', 'stepSlot', 'stepConfirm']);
  });
});

describe('selectService', () => {
  it('should drop the doctor and the slot when another service is chosen', () => {
    const patch = selectService(draft({ serviceId: 'a', doctorId: 'd', slotId: 's', slotStart: SLOT.start, slotEnd: SLOT.end, step: 4 }), 'b');

    expect(patch).toEqual({ serviceId: 'b', doctorId: null, slotId: null, slotStart: null, slotEnd: null, step: 2 });
  });

  it('should keep the doctor and the slot when the same service is chosen again', () => {
    expect(selectService(draft({ serviceId: 'a', doctorId: 'd', step: 1 }), 'a')).toEqual({ step: 2 });
  });

  it('should accept "any service" as a choice of its own when the visitor does not know the service', () => {
    expect(selectService(draft({ serviceId: 'a' }), null)).toMatchObject({ serviceId: null, doctorId: null, step: 2 });
  });
});

describe('selectDoctor', () => {
  it('should drop the slot when another doctor is chosen', () => {
    expect(selectDoctor(draft({ doctorId: 'd1', slotId: 's' }), 'd2')).toEqual({ doctorId: 'd2', slotId: null, slotStart: null, slotEnd: null, step: 3 });
  });

  it('should keep the slot when the same doctor is chosen again', () => {
    expect(selectDoctor(draft({ doctorId: 'd1', slotId: 's' }), 'd1')).toEqual({ step: 3 });
  });
});

describe('selectSlot', () => {
  it('should carry the slot bounds and move to the confirmation step when a slot is chosen', () => {
    expect(selectSlot(SLOT)).toEqual({ slotId: 'slot-1', slotStart: SLOT.start, slotEnd: SLOT.end, step: 4 });
  });
});

describe('draftFromSlot', () => {
  it('should prepare the confirmation step when a slot was picked on the doctor page', () => {
    expect(draftFromSlot('d1', SLOT)).toEqual({ serviceId: null, doctorId: 'd1', reason: '', slotId: 'slot-1', slotStart: SLOT.start, slotEnd: SLOT.end, step: 4 });
  });
});

describe('draftForDoctor', () => {
  it('should open the slot step when the doctor comes from a deep link', () => {
    expect(draftForDoctor('d1')).toMatchObject({ doctorId: 'd1', slotId: null, step: 3 });
  });
});

describe('repairDraft', () => {
  it('should leave the draft alone when it is consistent', () => {
    const ready = draft({ doctorId: 'd', slotId: 's', slotStart: SLOT.start, slotEnd: SLOT.end, step: 4 });

    expect(repairDraft(ready, NOW)).toBeNull();
  });

  it('should drop the slot and return to the slot step when it has already started', () => {
    const stale = draft({ doctorId: 'd', slotId: 's', slotStart: '2026-10-15T08:00:00.000Z', slotEnd: '2026-10-15T08:30:00.000Z', step: 4 });

    expect(repairDraft(stale, NOW)).toEqual({ slotId: null, slotStart: null, slotEnd: null, step: 3 });
  });

  it('should fall back from the confirmation step when there is no slot', () => {
    expect(repairDraft(draft({ doctorId: 'd', step: 4 }), NOW)).toEqual({ step: 3 });
  });

  it('should fall back to the doctor step when neither slot nor doctor is known', () => {
    expect(repairDraft(draft({ step: 4 }), NOW)).toEqual({ step: 2 });
  });

  it('should not open the slot step when the draft has no doctor', () => {
    expect(repairDraft(draft({ step: 3 }), NOW)).toEqual({ step: 2 });
  });

  it('should leave the draft alone when it is on one of the first steps', () => {
    expect(repairDraft(draft({ step: 1 }), NOW)).toBeNull();
    expect(repairDraft(draft({ step: 2 }), NOW)).toBeNull();
  });
});
