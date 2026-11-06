'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { DIALOG_CLOSE_ATTRIBUTE } from './use-dialog-focus';

const FOCUSABLE = `a[href], button:not([disabled]):not([${DIALOG_CLOSE_ATTRIBUTE}]), textarea, input, select, [tabindex]:not([tabindex="-1"])`;

export function useScrollLock(): void {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
}

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

export function useModalBehavior(panel: RefObject<HTMLElement | null>): void {
  useScrollLock();
  useFocusWhenReady(panel);
  useFocusFallbackOnClose();
}

export function useFocusFallbackOnClose(): void {
  useEffect(
    () => () => {
      // One tick later: a screen that knows a better focus target hands it over in its own effect right after unmount.
      setTimeout(() => {
        const active: Element | null = document.activeElement;
        if (active !== null && active !== document.body) return;
        const heading: HTMLElement | null = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
        if (heading === null) return;
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }, 0);
    },
    [],
  );
}
