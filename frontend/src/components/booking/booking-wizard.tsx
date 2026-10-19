'use client';

import type { ReactNode } from 'react';
import { useBookingDraftStore, type BookingDraft, type BookingStep } from '@/store/use-booking-draft-store';
import type { Slot } from '@/components/catalog/catalog-types';
import { useT } from '@/lib/i18n/use-t';
import { BookingStepper } from './booking-stepper';
import { selectDoctor, selectService, selectSlot } from './booking-steps';
import { BookingSuccess } from './booking-success';
import { ConfirmStep } from './confirm-step';
import { DoctorStep } from './doctor-step';
import { ServiceStep } from './service-step';
import { SlotStep } from './slot-step';
import { useBookingSubmit, type BookingSubmit } from './use-booking-submit';
import { useDraftRepair } from './use-draft-repair';
import { useStepFocus } from './use-step-focus';

interface StepViewProps {
  readonly draft: BookingDraft;
  readonly booking: BookingSubmit;
  readonly update: (patch: Partial<BookingDraft>) => void;
}

function StepView({ draft, booking, update }: StepViewProps): ReactNode {
  const choose = (patch: Partial<BookingDraft>): void => {
    booking.reset();
    update(patch);
  };
  if (draft.step === 1) return <ServiceStep selectedServiceId={draft.serviceId} onSelect={(id) => choose(selectService(draft, id))} />;
  if (draft.step === 2 || draft.doctorId === null) {
    return <DoctorStep serviceId={draft.serviceId} selectedDoctorId={draft.doctorId} onSelect={(id) => choose(selectDoctor(draft, id))} />;
  }
  if (draft.step === 3 || draft.slotId === null) {
    return (
      <SlotStep
        doctorId={draft.doctorId}
        serviceId={draft.serviceId}
        selectedSlotId={draft.slotId}
        selectedSlotStart={draft.slotStart}
        notice={booking.notice}
        takenSlot={booking.takenSlot}
        onSelect={(slot: Slot) => choose(selectSlot(slot))}
      />
    );
  }
  return <ConfirmStep draft={draft} booking={booking} onReasonChange={(reason) => update({ reason })} />;
}

/**
 * Booking wizard (FR-003/004): service → doctor → slot → confirmation. The draft lives in `sessionStorage`, so a guest
 * who picked a slot on a doctor page comes back from the login on the confirmation step with everything in place.
 */
export function BookingWizard({ presetDoctorId }: { readonly presetDoctorId?: string }): ReactNode {
  const t = useT('booking');
  const draft = useBookingDraftStore();
  const isRestored: boolean = useDraftRepair(presetDoctorId);
  const booking = useBookingSubmit();
  const container = useStepFocus(draft.step, booking.notice !== null);
  if (booking.created !== null) return <BookingSuccess appointmentId={booking.created.id} />;
  const goTo = (step: BookingStep): void => {
    booking.reset();
    draft.updateDraft({ step });
  };
  return (
    <section ref={container} aria-label={t('title')} className="space-y-5">
      <BookingStepper current={draft.step} onGo={goTo} />
      {isRestored && draft.step === 4 ? <p role="status" className="text-sm text-[var(--muted-foreground)]">{t('draftRestored')}</p> : null}
      <StepView draft={draft} booking={booking} update={draft.updateDraft} />
    </section>
  );
}
