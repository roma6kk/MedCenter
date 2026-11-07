'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { BookingStep } from '@/store/use-booking-draft-store';

/** Moves focus to the new step's heading (the activated element is gone). Not on first render, not when `quiet` (a refused booking's alert must not be interrupted). */
export function useStepFocus(step: BookingStep, quiet: boolean): RefObject<HTMLElement> {
  const container = useRef<HTMLElement>(null);
  const shownStep = useRef<BookingStep>(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    if (quiet) return;
    const heading: HTMLElement | null | undefined = container.current?.querySelector<HTMLElement>('h2');
    if (heading === null || heading === undefined) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [step, quiet]);
  return container;
}
