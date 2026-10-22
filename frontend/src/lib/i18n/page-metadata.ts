/**
 * page-metadata — the server-rendered `<title>` of a page, from the same catalogue the client reads.
 *
 * The language of a visitor is only known in the browser (a stored choice, never a cookie the server could read), so the
 * server renders the default language and `useDocumentTitle` takes over after hydration. Keeping the Russian text in
 * `messages/ru.json` means no page module carries a hard-coded title; the root layout's `title.template` adds the brand.
 */
import type { Metadata } from 'next';
import { DEFAULT_LOCALE } from './locale';
import { createTranslate } from './translate';

/** `export const metadata = pageMetadata('doctor.journal.title')`: the title of a page in the default language. */
export function pageMetadata(titleKey: string): Metadata {
  return { title: createTranslate(DEFAULT_LOCALE)(titleKey) };
}

/** The defaults every page inherits: the clinic's name as the title, `«<page> — Лайфлайн»` for pages that name themselves. */
export function rootMetadata(): Metadata {
  const t = createTranslate(DEFAULT_LOCALE);
  return { title: { default: t('home.title'), template: `%s — ${t('layout.brand')}` }, description: t('layout.description') };
}
