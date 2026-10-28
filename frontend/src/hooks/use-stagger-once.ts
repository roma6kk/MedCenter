'use client';

import { useEffect, useState } from 'react';

/** The longest entrance: the delay stops at the ninth child (see `.stagger-children`, globals.css) plus the animation itself. */
export const STAGGER_WINDOW_MS = 700;

/**
 * Entrance of a list on its first load (VE1): the children of the element that wears the returned class fade in and rise a
 * few pixels, one after another (`.stagger-children` in globals.css; put the class on the `ul`, `tbody` or grid itself).
 * The window closes shortly after the list shows, so rows that arrive with a later page, a refetch or a filter are added
 * without motion (a repeated animation on every refresh reads as lag). `isReady` is false while the data is still loading:
 * the window opens when the rows appear, not when the screen mounts. Reduced motion needs nothing here: the global rule
 * drops every animation.
 */
export function useStaggerOnce(isReady: boolean = true): 'stagger-children' | undefined {
  const [isExpired, setIsExpired] = useState<boolean>(false);
  useEffect(() => {
    if (!isReady) return undefined;
    const timer = setTimeout(() => setIsExpired(true), STAGGER_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [isReady]);
  return isReady && !isExpired ? 'stagger-children' : undefined;
}
