'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import type { BookingStep } from '@/store/use-booking-draft-store';
import { BOOKING_STEPS, type StepDefinition } from './booking-steps';

interface BookingStepperProps {
  readonly current: BookingStep;
  /** Goes back to an earlier step; later steps are reached by making the choice that leads there. */
  readonly onGo: (step: BookingStep) => void;
}

const ITEM_CLASS = 'flex min-h-[44px] items-center gap-2 rounded-[6px] border px-3 py-2 text-sm';

function StepItem({ item, current, onGo }: BookingStepperProps & { readonly item: StepDefinition }): ReactNode {
  const t = useT('booking');
  const label: string = t(item.labelKey);
  const content: ReactNode = (
    <>
      <span className="mono text-xs">{item.step}</span>
      {/* A text node between the flex items is not drawn, but it keeps "1 Услуга" (not "1Услуга") as the visible text that the accessible name must contain (WCAG 2.5.3). */}
      {' '}
      <span className={item.step === current ? '' : 'hidden sm:inline'}>{label}</span>
    </>
  );
  if (item.step === current) {
    return <span aria-current="step" className={`${ITEM_CLASS} border-[var(--primary)] border-[1.5px] font-semibold`}>{content}</span>;
  }
  if (item.step < current) {
    return (
      <button type="button" onClick={() => onGo(item.step)} aria-label={t('stepBack', { step: item.step, label })} className={`${ITEM_CLASS} border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)]`}>
        {content}
      </button>
    );
  }
  return <span className={`${ITEM_CLASS} border-[var(--border)] text-[var(--muted-foreground)]`}>{content}</span>;
}

/** The four numbered steps as hairline boxes (frontend-design-spec §C.2); the current one has a primary border. */
export function BookingStepper({ current, onGo }: BookingStepperProps): ReactNode {
  const t = useT('booking');
  return (
    <nav aria-label={t('stepsLabel')}>
      <ol className="flex flex-wrap gap-2">
        {BOOKING_STEPS.map((item) => (
          <li key={item.step}><StepItem item={item} current={current} onGo={onGo} /></li>
        ))}
      </ol>
    </nav>
  );
}
