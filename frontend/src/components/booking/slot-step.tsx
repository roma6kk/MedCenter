'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { QueryLoading } from '@/components/catalog/query-loading';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import type { Slot } from '@/components/catalog/catalog-types';
import { clinicDayOf } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import type { BookingNotice } from './use-booking-submit';
import { SlotPicker } from './slot-picker';

interface SlotStepProps {
  readonly doctorId: string;
  readonly serviceId: string | null;
  readonly selectedSlotId: string | null;
  readonly selectedSlotStart: string | null;
  /** Why the visitor is back on this step after a refused booking. */
  readonly notice: BookingNotice | null;
  /** The slot the server refused, shown as taken. */
  readonly takenSlot: Slot | null;
  readonly onSelect: (slot: Slot) => void;
}

const NOTICE_KEY: Readonly<Record<BookingNotice, string>> = {
  conflict: 'conflictLead',
  gone: 'gone',
  mismatch: 'mismatch',
};

/**
 * Why the visitor is back here. The button they pressed (on the confirmation step) is gone, so focus would fall to the
 * page start: the alert itself takes it (WCAG 2.4.3). It is announced as an alert on insertion; focus keeps the position.
 */
function RefusedNotice({ notice }: { readonly notice: BookingNotice }): ReactNode {
  const t = useT('booking');
  const box = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <p
      ref={box}
      role="alert"
      tabIndex={-1}
      data-testid="slot-conflict-notice"
      className="mt-3 rounded-control border border-destructive bg-destructive-soft p-3 text-sm text-destructive"
    >
      {t(NOTICE_KEY[notice])}
    </p>
  );
}

/** Step 3: free slots of the chosen doctor, narrowed to the length of the chosen service. */
export function SlotStep({ doctorId, serviceId, selectedSlotId, selectedSlotStart, notice, takenSlot, onSelect }: SlotStepProps): ReactNode {
  const t = useT('booking');
  const doctor = useDoctor(doctorId);
  const service = useService(serviceId);
  const waitingForService: boolean = serviceId !== null && service.isPending;
  return (
    <div>
      <h2 className="text-[22px] font-bold">{t('slotTitle')}</h2>
      {doctor.data === undefined ? null : <p className="mt-1 text-[15px] text-muted-foreground">{t('slotDoctor', { doctor: doctor.data.name })}</p>}
      {notice === null ? null : <RefusedNotice notice={notice} />}
      <div className="mt-4">
        {waitingForService ? (
          <QueryLoading />
        ) : (
          <SlotPicker
            doctorId={doctorId}
            selectedSlotId={selectedSlotId}
            onSelect={onSelect}
            durationMin={service.data?.defaultDurationMin ?? null}
            takenSlot={takenSlot}
            {...(selectedSlotStart === null ? {} : { initialFrom: clinicDayOf(selectedSlotStart) })}
          />
        )}
      </div>
    </div>
  );
}
