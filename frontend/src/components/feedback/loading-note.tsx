'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

export const SLOW_LOADING_MS = 3000;

interface LoadingNoteProps {
  readonly quiet?: boolean;
}

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
