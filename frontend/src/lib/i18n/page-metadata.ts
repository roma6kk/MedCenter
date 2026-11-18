// The server renders the default-language title; `useDocumentTitle` takes over after hydration.
import type { Metadata } from 'next';
import { DEFAULT_LOCALE } from './locale';
import { createTranslate } from './translate';

export function pageMetadata(titleKey: string): Metadata {
  return { title: createTranslate(DEFAULT_LOCALE)(titleKey) };
}

export function rootMetadata(): Metadata {
  const t = createTranslate(DEFAULT_LOCALE);
  return { title: { default: t('home.title'), template: `%s — ${t('layout.brand')}` }, description: t('layout.description') };
}
