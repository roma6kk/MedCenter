'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// If the opener is gone when the dialog closes, focus would fall to the body: hand it to `fallback`.
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
