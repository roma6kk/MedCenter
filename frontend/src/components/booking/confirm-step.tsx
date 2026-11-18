'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useRetryCooldown } from '@/lib/api/use-retry-cooldown';
import { useT } from '@/lib/i18n/use-t';
import type { BookingDraft, BookingStep } from '@/store/use-booking-draft-store';
import { BookingSummary } from './booking-summary';
import type { BookingSubmit } from './use-booking-submit';

interface ConfirmStepProps {
  readonly draft: Pick<BookingDraft, 'serviceId' | 'doctorId' | 'slotStart' | 'slotEnd'>;
  readonly onEdit: (step: BookingStep) => void;
  readonly booking: Pick<BookingSubmit, 'submit' | 'isPending' | 'problem'>;
}

interface ConfirmButtonProps {
  readonly isPending: boolean;
  readonly cooldown: number;
  readonly onConfirm: () => void;
}

/** `aria-disabled`, not `disabled`: the pressed button keeps keyboard focus (a disabled one drops it in some browsers). */
function ConfirmButton({ isPending, cooldown, onConfirm }: ConfirmButtonProps): ReactNode {
  const t = useT('booking');
  const closed: boolean = isPending || cooldown > 0;
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-4 shadow-elev-3 md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <Button
        size="lg"
        onClick={() => (closed ? undefined : onConfirm())}
        aria-disabled={closed ? true : undefined}
        aria-busy={isPending}
        data-testid="booking-confirm"
        className="w-full"
      >
        {isPending ? t('submitting') : cooldown > 0 ? t('retryIn', { seconds: cooldown }) : t('confirm')}
      </Button>
    </div>
  );
}

export function ConfirmStep({ draft, onEdit, booking }: ConfirmStepProps): ReactNode {
  const t = useT('booking');
  const cooldown: number = useRetryCooldown(booking.problem);
  return (
    <>
      <div className="min-w-0 flex-[999_1_480px]">
        <h2 className="text-xl font-bold">{t('confirmTitle')}</h2>
        {booking.problem === null ? null : <div className="mt-4"><ProblemBanner problem={booking.problem} /></div>}
      </div>
      <aside className="min-w-0 flex-[1_1_320px] pb-24 md:pb-0">
        <BookingSummary
          draft={{ ...draft, step: 4 }}
          onEdit={onEdit}
          showPlace
          action={<ConfirmButton isPending={booking.isPending} cooldown={cooldown} onConfirm={booking.submit} />}
        />
      </aside>
    </>
  );
}
