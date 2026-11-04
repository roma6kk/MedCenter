'use client';

import { useEffect, type ReactNode } from 'react';
import { useBookingDraftStore, type BookingDraft, type BookingStep } from '@/store/use-booking-draft-store';
import type { Slot } from '@/components/catalog/catalog-types';
import { RENAVIGATE_EVENT } from '@/components/layout/nav-link';
import { useT } from '@/lib/i18n/use-t';
import { BookingStepper } from './booking-stepper';
import { selectDoctor, selectDoctorSlot, selectService, selectSlot } from './booking-steps';
import { BookingSuccess } from './booking-success';
import { BookingSummary } from './booking-summary';
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
  readonly goTo: (step: BookingStep) => void;
}

function StepView({ draft, booking, update, goTo }: StepViewProps): ReactNode {
  const choose = (patch: Partial<BookingDraft>): void => {
    booking.reset();
    update(patch);
  };
  if (draft.step === 1) return <ServiceStep selectedServiceId={draft.serviceId} onSelect={(id) => choose(selectService(draft, id))} />;
  if (draft.step === 2 || draft.doctorId === null) {
    return (
      <DoctorStep
        serviceId={draft.serviceId}
        selectedDoctorId={draft.doctorId}
        onSelect={(id) => choose(selectDoctor(draft, id))}
        onSelectSlot={(id, slot) => choose(selectDoctorSlot(id, slot))}
      />
    );
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
  return <ConfirmStep draft={draft} booking={booking} onReasonChange={(reason) => update({ reason })} onEdit={goTo} />;
}

interface BookingWizardProps {
  readonly presetDoctorId?: string;
  /** The page title and lead: drawn above the steps, and dropped once the visit is booked (the success screen has its own heading). */
  readonly header?: ReactNode;
}

/**
 * Booking wizard (FR-003/004): service → doctor → slot → confirmation. The draft lives in `sessionStorage`, so a guest
 * who picked a slot on a doctor page comes back from the login on the confirmation step with everything in place.
 */
export function BookingWizard({ presetDoctorId, header }: BookingWizardProps): ReactNode {
  const t = useT('booking');
  const draft = useBookingDraftStore();
  const isRestored: boolean = useDraftRepair(presetDoctorId);
  const booking = useBookingSubmit();
  const container = useStepFocus(draft.step, booking.notice !== null);
  const { startOver, created } = booking;
  // A click on a link to /booking while the success screen is open (the header's «Записаться») starts the next booking.
  useEffect(() => {
    if (created === null) return undefined;
    window.addEventListener(RENAVIGATE_EVENT, startOver);
    return () => window.removeEventListener(RENAVIGATE_EVENT, startOver);
  }, [created, startOver]);
  if (created !== null) return <BookingSuccess visit={created} onBookAnother={startOver} />;
  const showsConfirm: boolean = draft.step === 4 && draft.doctorId !== null && draft.slotId !== null;
  const goTo = (step: BookingStep): void => {
    booking.reset();
    draft.updateDraft({ step });
  };
  return (
    <>
      {header}
      <section ref={container} aria-label={t('title')} className="flex flex-col gap-7">
        <BookingStepper current={draft.step} onGo={goTo} />
        {isRestored && draft.step === 4 ? <p role="status" className="text-sm text-muted-foreground">{t('draftRestored')}</p> : null}
        {/* The summary panel «Ваша запись» stays beside every step; on the confirmation step it also holds the confirm button, so that step brings its own. */}
        <div className="flex flex-wrap items-start gap-6">
          {showsConfirm ? (
            <StepView draft={draft} booking={booking} update={draft.updateDraft} goTo={goTo} />
          ) : (
            <>
              {/* Keyed by step: a new step slides and fades in (CSS only; the global reduced-motion rule drops it). */}
              <div key={draft.step} className="min-w-0 flex-[999_1_560px] animate-step-in">
                <StepView draft={draft} booking={booking} update={draft.updateDraft} goTo={goTo} />
              </div>
              <aside className="min-w-0 flex-[1_1_300px]">
                <BookingSummary draft={draft} />
              </aside>
            </>
          )}
        </div>
      </section>
    </>
  );
}
