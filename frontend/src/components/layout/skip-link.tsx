'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

export const MAIN_CONTENT_ID = 'main-content';

export function SkipLink(): ReactNode {
  const t = useT('layout');
  return <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">{t('skipToContent')}</a>;
}
