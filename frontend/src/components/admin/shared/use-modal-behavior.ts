'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** While a modal is open the page behind it does not scroll: a wheel over the dialog on a phone would move the page under it. */
export function useScrollLock(): void {
  useEffect(() => {
    const previous: string = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

/**
 * Keeps the keyboard focus in a dialog whose content is still loading (the schedule editor waits for its pickers): the panel
 * itself takes the focus, and the first control takes it over once one appears. After that the focus is the user's.
 */
export function useFocusWhenReady(panel: RefObject<HTMLElement | null>): void {
  const isSettled = useRef(false);
  useEffect(() => {
    const element: HTMLElement | null = panel.current;
    if (element === null || isSettled.current) return;
    const first: HTMLElement | null = element.querySelector<HTMLElement>(FOCUSABLE);
    if (first === null) {
      element.focus();
      return;
    }
    if (document.activeElement === element || !element.contains(document.activeElement)) first.focus();
    isSettled.current = true;
  });
}

/** Everything a modal does around its content: locks the page behind it, holds the focus, and never drops it on `body` when it closes. */
export function useModalBehavior(panel: RefObject<HTMLElement | null>): void {
  useScrollLock();
  useFocusWhenReady(panel);
  useFocusFallbackOnClose();
}

/**
 * When a dialog closes after its action succeeded, the control that opened it may be gone (a deleted row, a «Деактивировать»
 * that became «Активировать»); the focus would fall to `body` (WCAG 2.4.3). It then goes to the heading of the page.
 */
export function useFocusFallbackOnClose(): void {
  useEffect(
    () => () => {
      const active: Element | null = document.activeElement;
      if (active !== null && active !== document.body) return;
      const heading: HTMLElement | null = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
      if (heading === null) return;
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    },
    [],
  );
}
