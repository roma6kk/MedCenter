'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlotPicker } from '@/components/booking/slot-picker';
import { draftFromSlot } from '@/components/booking/booking-steps';
import { formatSlotDateTime } from '@/components/booking/slot-time';
import { useT } from '@/lib/i18n/use-t';
import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import type { Slot } from './catalog-types';

interface BookButtonProps {
  readonly selected: Slot | null;
  readonly onBook: () => void;
}

function BookButton({ selected, onBook }: BookButtonProps): ReactNode {
  const t = useT('catalog');
  const locale = useUiStore((state) => state.locale);
  return (
    <button
      type="button"
      onClick={onBook}
      disabled={selected === null}
      className="min-h-[44px] w-full rounded-[6px] bg-[var(--primary)] px-6 py-2 text-[var(--primary-foreground)] disabled:opacity-60 md:w-auto"
    >
      {selected === null ? t('bookDisabled') : t('bookSelected', { time: formatSlotDateTime(selected.start, locale) })}
    </button>
  );
}

/**
 * Free slots of the doctor and the "book" button (FR-003, scenario A). A guest can pick a slot: the choice goes to the
 * draft in `sessionStorage`, the wizard's route sends the guest to the login and brings them back to the confirmation.
 */
export function DoctorSlotsBooking({ doctorId }: { readonly doctorId: string }): ReactNode {
  const t = useT('catalog');
  const router = useRouter();
  const role = useSessionStore((state) => state.role);
  const [selected, setSelected] = useState<Slot | null>(null);
  const handleBook = (): void => {
    if (selected === null) return;
    useBookingDraftStore.getState().updateDraft(draftFromSlot(doctorId, selected));
    router.push('/booking');
  };
  return (
    <div className="space-y-4">
      <SlotPicker doctorId={doctorId} selectedSlotId={selected?.id ?? null} onSelect={setSelected} />
      <div className="no-print sticky bottom-0 -mx-4 border-t border-[var(--border)] bg-[var(--background)] p-4 md:static md:mx-0 md:border-0 md:p-0">
        {role === 'DOCTOR' || role === 'ADMIN' ? <p className="text-sm text-[var(--muted-foreground)]">{t('patientsOnly')}</p> : <BookButton selected={selected} onBook={handleBook} />}
      </div>
    </div>
  );
}
