'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { useT } from '@/lib/i18n/use-t';
import type { BookingStep } from '@/store/use-booking-draft-store';
import { BOOKING_STEPS, type StepDefinition } from './booking-steps';

interface BookingStepperProps {
  readonly current: BookingStep;
  readonly onGo: (step: BookingStep) => void;
}

const ITEM_CLASS = 'flex min-h-[44px] items-center gap-2 text-base';
const CIRCLE_CLASS = 'tabular-nums inline-flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-semibold transition-[background-color,box-shadow] duration-base ease-out';

function StepMarker({ step, isCurrent, isDone }: { readonly step: number; readonly isCurrent: boolean; readonly isDone: boolean }): ReactNode {
  if (isDone) {
    return (
      <span aria-hidden="true" data-testid={`step-marker-${step}`} data-state="done" className={cn(CIRCLE_CLASS, 'bg-primary text-primary-foreground')}>
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid={`step-marker-${step}`}
      data-state={isCurrent ? 'current' : 'next'}
      className={cn(CIRCLE_CLASS, isCurrent ? 'border-2 border-primary bg-card text-primary-soft-foreground ring-4 ring-primary-soft' : 'bg-secondary text-muted-foreground')}
    >
      {step}
    </span>
  );
}

function StepItem({ item, current, onGo }: BookingStepperProps & { readonly item: StepDefinition }): ReactNode {
  const t = useT('booking');
  const label: string = t(item.labelKey);
  const isCurrent: boolean = item.step === current;
  const isDone: boolean = item.step < current;
  const content: ReactNode = (
    <>
      <StepMarker step={item.step} isCurrent={isCurrent} isDone={isDone} />
      {/* A text node between the flex items is not drawn but keeps the label apart from the number for assistive tech (WCAG 2.5.3). */}
      {' '}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </>
  );
  if (isCurrent) {
    return <span aria-current="step" className={cn(ITEM_CLASS, 'font-semibold text-foreground')}>{content}</span>;
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

export function BookingStepper({ current, onGo }: BookingStepperProps): ReactNode {
  const t = useT('booking');
  return (
    <nav aria-label={t('stepsLabel')} className="flex flex-col gap-1">
      <div aria-hidden="true" data-testid="stepper-track" className="h-1 overflow-hidden rounded-full bg-border">
        <div
          data-testid="stepper-progress"
          className="h-full rounded-full bg-primary transition-[width] duration-slow ease-out"
          style={{ width: `${(current / BOOKING_STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="grid grid-cols-4 gap-3">
        {BOOKING_STEPS.map((item) => (
          <li key={item.step} className="flex min-w-0 flex-col">
            <StepItem item={item} current={current} onGo={onGo} />
          </li>
        ))}
      </ol>
      <p aria-hidden="true" data-testid="stepper-current-label" className="pt-1 text-base font-semibold sm:hidden">
        {t(BOOKING_STEPS.find((item) => item.step === current)?.labelKey ?? 'stepService')}
      </p>
    </nav>
  );
}
