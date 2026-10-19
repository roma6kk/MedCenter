'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * When a dialog closes, the focus normally goes back to the button that opened it. If that button is gone by then (the
 * action it started removed it, e.g. a cancelled appointment loses its cancel button) the focus would fall to the page
 * body and a keyboard user would start again from the top. This hands it to `fallback` instead.
 */
export function useFocusFallback(isDialogOpen: boolean, fallback: RefObject<HTMLElement>): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isDialogOpen) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current && document.activeElement === document.body) fallback.current?.focus();
    wasOpen.current = false;
  }, [isDialogOpen, fallback]);
}
