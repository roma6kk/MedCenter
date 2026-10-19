'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { BookingStep } from '@/store/use-booking-draft-store';

/**
 * When the wizard moves to another step the element the visitor activated is gone, and keyboard focus would fall back to
 * the page start. Moves focus to the heading of the new step instead (WCAG 2.4.3). Not on the first render, and not when
 * `quiet` is set (a refused booking: its alert is announced and must not be interrupted).
 */
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
