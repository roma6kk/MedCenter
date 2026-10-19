'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

/**
 * An action can remove the very control the keyboard user pressed (the "mark as read" button of an item that leaves the
 * "unread" list). The refreshed list is on screen once `version` (the read's `dataUpdatedAt`) differs from the one the action
 * started with; if the focus fell to the page body by then, it goes to the first target that exists: the list while it has
 * items, otherwise the panel that always does. A focus that is still on a real element is left alone.
 *
 * Returns `begin`: call it when the action starts, call what it returns when the action succeeded.
 */
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
