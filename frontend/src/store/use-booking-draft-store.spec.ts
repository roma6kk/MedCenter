import { BOOKING_DRAFT_KEY, useBookingDraftStore } from './use-booking-draft-store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('useBookingDraftStore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useBookingDraftStore.getState().clearDraft();
  });

  it('should start at the service step with nothing chosen', () => {
    const draft = useBookingDraftStore.getState();

    expect(draft.step).toBe(1);
    expect(draft.serviceId).toBeNull();
    expect(draft.doctorId).toBeNull();
    expect(draft.slotId).toBeNull();
    expect(draft.idempotencyKey).toBeNull();
  });

  it('should persist the draft in sessionStorage so it survives the login redirect', () => {
    useBookingDraftStore.getState().updateDraft({ doctorId: 'doc-1', slotId: 'slot-1', step: 4 });

    const stored = JSON.parse(window.sessionStorage.getItem(BOOKING_DRAFT_KEY) ?? '{}') as { state?: { doctorId?: string; step?: number } };

    expect(stored.state?.doctorId).toBe('doc-1');
    expect(stored.state?.step).toBe(4);
  });

  describe('ensureIdempotencyKey', () => {
    it('should create a uuid once and return the same key afterwards', () => {
      const first = useBookingDraftStore.getState().ensureIdempotencyKey();
      const second = useBookingDraftStore.getState().ensureIdempotencyKey();

      expect(first).toMatch(UUID_PATTERN);
      expect(second).toBe(first);
      expect(useBookingDraftStore.getState().idempotencyKey).toBe(first);
    });

    it('should issue a new key after the draft was cleared', () => {
      const first = useBookingDraftStore.getState().ensureIdempotencyKey();
      useBookingDraftStore.getState().clearDraft();

      expect(useBookingDraftStore.getState().ensureIdempotencyKey()).not.toBe(first);
    });
  });

  describe('booking intent', () => {
    it('should drop the key when another slot is chosen because the request body changes', () => {
      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1' });
      const first = useBookingDraftStore.getState().ensureIdempotencyKey();

      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-2' });

      expect(useBookingDraftStore.getState().idempotencyKey).toBeNull();
      expect(useBookingDraftStore.getState().ensureIdempotencyKey()).not.toBe(first);
    });

    it('should drop the key when the reason changes', () => {
      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1', reason: 'Болит спина' });
      useBookingDraftStore.getState().ensureIdempotencyKey();

      useBookingDraftStore.getState().updateDraft({ reason: 'Болит голова' });

      expect(useBookingDraftStore.getState().idempotencyKey).toBeNull();
    });

    it('should keep the key when only the step moves, so a retry of the same intent stays idempotent', () => {
      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1', step: 4 });
      const key = useBookingDraftStore.getState().ensureIdempotencyKey();

      useBookingDraftStore.getState().updateDraft({ step: 3 });
      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1', step: 4 });

      expect(useBookingDraftStore.getState().idempotencyKey).toBe(key);
    });

    it('should keep the key when the same slot is written again', () => {
      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1' });
      const key = useBookingDraftStore.getState().ensureIdempotencyKey();

      useBookingDraftStore.getState().updateDraft({ slotId: 'slot-1' });

      expect(useBookingDraftStore.getState().idempotencyKey).toBe(key);
    });
  });

  describe('releaseSlot', () => {
    it('should forget the slot and its key but keep service, doctor and reason', () => {
      useBookingDraftStore.getState().updateDraft({ serviceId: 's-1', doctorId: 'd-1', slotId: 'slot-1', slotStart: '2026-10-19T11:00:00.000Z', reason: 'Болит спина', step: 4 });
      useBookingDraftStore.getState().ensureIdempotencyKey();

      useBookingDraftStore.getState().releaseSlot();

      const draft = useBookingDraftStore.getState();
      expect(draft.slotId).toBeNull();
      expect(draft.slotStart).toBeNull();
      expect(draft.idempotencyKey).toBeNull();
      expect(draft.step).toBe(3);
      expect(draft.serviceId).toBe('s-1');
      expect(draft.doctorId).toBe('d-1');
      expect(draft.reason).toBe('Болит спина');
    });
  });
});
