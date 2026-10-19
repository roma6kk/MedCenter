'use client';

import { useEffect, useRef } from 'react';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { draftForDoctor, repairDraft } from './booking-steps';

/**
 * Makes the draft safe to show when the wizard opens: a deep link `?doctorId=` starts at that doctor's times, and a
 * draft restored from `sessionStorage` (the login round trip) loses a slot that has started in the meantime.
 * Returns `true` when the wizard opened on a draft that already holds a chosen slot — the confirmation is "restored".
 */
export function useDraftRepair(presetDoctorId: string | undefined): boolean {
  const wasRestored = useRef<boolean | null>(null);
  if (wasRestored.current === null) {
    const draft = useBookingDraftStore.getState();
    wasRestored.current = presetDoctorId === undefined && draft.slotId !== null && draft.step === 4 && repairDraft(draft) === null;
  }
  useEffect(() => {
    const store = useBookingDraftStore.getState();
    if (presetDoctorId !== undefined && presetDoctorId !== store.doctorId) {
      store.updateDraft(draftForDoctor(presetDoctorId));
      return;
    }
    const patch = repairDraft(store);
    if (patch !== null) store.updateDraft(patch);
  }, [presetDoctorId]);
  return wasRestored.current;
}
