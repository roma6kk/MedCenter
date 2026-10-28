'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

/** After this long a skeleton alone stops being a promise and starts looking like a hang (E4). */
export const SLOW_LOADING_MS = 3000;

/**
 * «Загружаем…» under a skeleton that has been on screen for more than three seconds. It lives inside the skeleton's
 * `role="status"` region, so a screen reader hears that the wait goes on; a quick read never shows it. Mounting the skeleton
 * starts the clock, unmounting it (the data came, or the failure replaced it) stops it.
 */
export function LoadingNote(): ReactNode {
  const t = useT('common');
  const [isSlow, setIsSlow] = useState<boolean>(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!isSlow) return null;
  return <p className="animate-fade-in pt-1 text-sm text-muted-foreground">{t('loadingSlow')}</p>;
}
