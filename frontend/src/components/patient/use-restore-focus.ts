'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

// The pressed control may leave the list: once the refreshed list is on screen, restore lost focus to the first existing target.
export function useRestoreFocus(version: number, preferred: RefObject<HTMLElement>, fallback: RefObject<HTMLElement>): () => () => void {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (armedAt === null || version === armedAt) return;
    const active: Element | null = document.activeElement;
    if (active === null || active === document.body) (preferred.current ?? fallback.current)?.focus();
    setArmedAt(null);
  }, [armedAt, version, preferred, fallback]);
  return useCallback(() => () => setArmedAt(version), [version]);
}
