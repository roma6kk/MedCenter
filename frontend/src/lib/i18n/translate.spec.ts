import { LOCALES } from './locale';
import { createTranslate, hasMessage, MESSAGES, translate } from './translate';
import { useUiStore } from '@/store/use-ui-store';

function leafPaths(node: unknown, prefix = ''): ReadonlyArray<string> {
  if (typeof node === 'string') return [prefix];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) => leafPaths(child, prefix === '' ? key : `${prefix}.${key}`));
}

describe('messages catalogues', () => {
  it('should hold the same keys in ru and en', () => {
    const ru = [...leafPaths(MESSAGES.ru)].sort();
    const en = [...leafPaths(MESSAGES.en)].sort();

    expect(en).toEqual(ru);
  });

  it.each(LOCALES)('should hold no empty message in %s', (locale) => {
    const empty = leafPaths(MESSAGES[locale]).filter((path) => {
      const parts = path.split('.');
      let node: unknown = MESSAGES[locale];
      parts.forEach((part) => {
        node = (node as Readonly<Record<string, unknown>>)[part];
      });
      return typeof node !== 'string' || node.trim().length === 0;
    });

    expect(empty).toEqual([]);
  });
});

describe('createTranslate', () => {
  it('should resolve a key inside a namespace', () => {
    expect(createTranslate('ru', 'layout.patient')('booking')).toBe('Запись');
  });

  it('should interpolate ICU values', () => {
    expect(createTranslate('ru', 'layout.notifications')('label', { count: 3 })).toBe('Уведомления, непрочитанных: 3');
  });

  it('should return the message path when the key is missing instead of throwing', () => {
    expect(createTranslate('ru', 'layout')('nope')).toBe('layout.nope');
  });

  it('should return the same translator for the same locale and namespace', () => {
    expect(createTranslate('en', 'common')).toBe(createTranslate('en', 'common'));
  });
});

describe('translate', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should follow the locale of the UI store', () => {
    useUiStore.setState({ locale: 'en' });

    expect(translate('errors.SLOT_CONFLICT')).toBe('The slot is already taken');
  });
});

describe('hasMessage', () => {
  it('should find a nested message and reject a namespace node', () => {
    expect(hasMessage('ru', 'errors.ROOM_IN_USE')).toBe(true);
    expect(hasMessage('ru', 'errors')).toBe(false);
    expect(hasMessage('ru', 'errors.UNKNOWN_CODE')).toBe(false);
  });
});
