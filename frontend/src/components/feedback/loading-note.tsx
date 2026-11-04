'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

/** After this long a skeleton alone stops being a promise and starts looking like a hang (E4). */
export const SLOW_LOADING_MS = 3000;

interface LoadingNoteProps {
  /**
   * A skeleton that is not the lead one of its screen (`useLeadSkeleton`) keeps the clock but says nothing: when the lead one
   * goes away this one takes over, and a wait that has already passed three seconds must not start the count again.
   */
  readonly quiet?: boolean;
}

/**
 * «Загружаем…» under a skeleton that has been on screen for more than three seconds. It lives inside the skeleton's
 * `role="status"` region, so a screen reader hears that the wait goes on; a quick read never shows it. Mounting the skeleton
 * starts the clock, unmounting it (the data came, or the failure replaced it) stops it.
 */
export function LoadingNote({ quiet = false }: LoadingNoteProps): ReactNode {
  const t = useT('common');
  const [isSlow, setIsSlow] = useState<boolean>(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!isSlow || quiet) return null;
  return <p className="animate-fade-in pt-1 text-sm text-muted-foreground">{t('loadingSlow')}</p>;
}
