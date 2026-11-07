'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { QueryLoading } from '@/components/catalog/query-loading';
import { useDoctor, useService } from '@/components/catalog/use-catalog';
import type { Slot } from '@/components/catalog/catalog-types';
import { clinicDayOf } from '@/lib/clinic-time';
import { doctorLabel } from '@/lib/doctor-name';
import { useT } from '@/lib/i18n/use-t';
import type { BookingNotice } from './use-booking-submit';
import { SlotPicker } from './slot-picker';

interface SlotStepProps {
  readonly doctorId: string;
  readonly serviceId: string | null;
  readonly selectedSlotId: string | null;
  readonly selectedSlotStart: string | null;
  readonly notice: BookingNotice | null;
  readonly takenSlot: Slot | null;
  readonly onSelect: (slot: Slot) => void;
}

const NOTICE_KEY: Readonly<Record<BookingNotice, string>> = {
  conflict: 'conflictLead',
  gone: 'gone',
  mismatch: 'mismatch',
  expired: 'expired',
};

/** The pressed button on the confirmation step is gone, so focus would fall to the page start: the alert takes it. */
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

export function SlotStep({ doctorId, serviceId, selectedSlotId, selectedSlotStart, notice, takenSlot, onSelect }: SlotStepProps): ReactNode {
  const t = useT('booking');
  const doctor = useDoctor(doctorId);
  const service = useService(serviceId);
  const waitingForService: boolean = serviceId !== null && service.isPending;
  return (
    <div>
      <h2 className="text-xl font-bold">{t('slotTitle')}</h2>
      {doctor.data === undefined ? null : <p className="mt-1 text-base text-muted-foreground">{t('slotDoctor', { doctor: doctorLabel(doctor.data) })}</p>}
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
            serviceId={serviceId}
            takenSlot={takenSlot}
            {...(selectedSlotStart === null ? {} : { initialFrom: clinicDayOf(selectedSlotStart) })}
          />
        )}
      </div>
    </div>
  );
}
