'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';

/** Id of the `<main>` landmark every page frame names; the skip link and the frames agree on it. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * The page's one skip link (WCAG 2.4.1), in the language of the interface. Every page frame (public, patient, staff,
 * sign-in card, message page) renders exactly one, right before its header, and targets its own `<main>`.
 */
export function SkipLink(): ReactNode {
  const t = useT('layout');
  return <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">{t('skipToContent')}</a>;
}
