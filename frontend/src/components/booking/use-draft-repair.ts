'use client';

import { useEffect, useRef } from 'react';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { draftForDoctor, repairDraft } from './booking-steps';

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
