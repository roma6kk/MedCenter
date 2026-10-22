'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { BookingStep } from '@/store/use-booking-draft-store';
import { BOOKING_STEPS, type StepDefinition } from './booking-steps';

interface BookingStepperProps {
  readonly current: BookingStep;
  /** Goes back to an earlier step; later steps are reached by making the choice that leads there. */
  readonly onGo: (step: BookingStep) => void;
}

const ITEM_CLASS = 'flex min-h-[44px] items-center gap-2 text-[15px]';

function StepItem({ item, current, onGo }: BookingStepperProps & { readonly item: StepDefinition }): ReactNode {
  const t = useT('booking');
  const label: string = t(item.labelKey);
  const isCurrent: boolean = item.step === current;
  const isDone: boolean = item.step < current;
  const content: ReactNode = (
    <>
      <span
        className={cn(
          'mono inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[13px]',
          isCurrent || isDone ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
        )}
      >
        {item.step}
      </span>
      {/* A text node between the flex items is not drawn, but it keeps "1 Услуга" (not "1Услуга") as the visible text that the accessible name must contain (WCAG 2.5.3). */}
      {' '}
      <span className={isCurrent ? '' : 'hidden sm:inline'}>{label}</span>
    </>
  );
  if (isCurrent) {
    return <span aria-current="step" className={cn(ITEM_CLASS, 'font-semibold text-primary-soft-foreground')}>{content}</span>;
  }
  if (isDone) {
    return (
      <button type="button" onClick={() => onGo(item.step)} aria-label={t('stepBack', { step: item.step, label })} className={cn(ITEM_CLASS, 'rounded-control font-medium text-primary-soft-foreground hover:underline')}>
        {content}
      </button>
    );
  }
  return <span className={cn(ITEM_CLASS, 'font-medium text-muted-foreground')}>{content}</span>;
}

/** The four steps as bars with a numbered circle (the design canvas); passed steps and the current one are drawn in primary. */
export function BookingStepper({ current, onGo }: BookingStepperProps): ReactNode {
  const t = useT('booking');
  return (
    <nav aria-label={t('stepsLabel')}>
      <ol className="grid grid-cols-4 gap-3">
        {BOOKING_STEPS.map((item) => (
          <li key={item.step} className="flex min-w-0 flex-col gap-1">
            <span aria-hidden="true" className={cn('h-1 rounded-full', item.step <= current ? 'bg-primary' : 'bg-border')} />
            <StepItem item={item} current={current} onGo={onGo} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
