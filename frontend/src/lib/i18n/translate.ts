import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import { useUiStore } from '@/store/use-ui-store';
import type { Locale } from './locale';

export type TranslateValues = Readonly<Record<string, string | number>>;
export type Translate = (key: string, values?: TranslateValues) => string;

export const MESSAGES: Readonly<Record<Locale, AbstractIntlMessages>> = { ru, en };

const cache = new Map<string, Translate>();

// A missing key renders as its path; the catalogue parity spec keeps the real keys complete.
function ignoreMissingMessage(): void {
}

export function createTranslate(locale: Locale, namespace?: string): Translate {
  const cacheKey = `${locale}:${namespace ?? ''}`;
  const cached: Translate | undefined = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const translator = createTranslator({
    locale,
    messages: MESSAGES[locale],
    ...(namespace === undefined ? {} : { namespace }),
    onError: ignoreMissingMessage,
    getMessageFallback: ({ namespace: scope, key }) => (scope === undefined ? key : `${scope}.${key}`),
  }) as unknown as (key: string, values?: TranslateValues) => string;
  const translate: Translate = (key, values) => translator(key, values);
  cache.set(cacheKey, translate);
  return translate;
}

export function translate(key: string, values?: TranslateValues): string {
  return createTranslate(useUiStore.getState().locale)(key, values);
}

export function hasMessage(locale: Locale, key: string): boolean {
  let node: unknown = MESSAGES[locale];
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Readonly<Record<string, unknown>>)[part];
  }
  return typeof node === 'string';
}
