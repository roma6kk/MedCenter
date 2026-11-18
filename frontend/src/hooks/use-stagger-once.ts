'use client';

import { useEffect, useState } from 'react';

export const STAGGER_WINDOW_MS = 700;

export function useStaggerOnce(isReady: boolean = true): 'stagger-children' | undefined {
  const [isExpired, setIsExpired] = useState<boolean>(false);
  useEffect(() => {
    if (!isReady) return undefined;
    const timer = setTimeout(() => setIsExpired(true), STAGGER_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [isReady]);
  return isReady && !isExpired ? 'stagger-children' : undefined;
}
