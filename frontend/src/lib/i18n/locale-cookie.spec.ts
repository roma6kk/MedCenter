import { LOCALE_COOKIE, LOCALE_INIT_SCRIPT, LOCALE_STORAGE_KEY, readLocaleCookie, writeLocaleCookie } from './locale';

function clearCookie(): void {
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
}

describe('locale cookie', () => {
  beforeEach(clearCookie);

  it('should be absent until the viewer has chosen', () => {
    expect(readLocaleCookie()).toBeNull();
  });

  it('should round-trip the chosen locale', () => {
    writeLocaleCookie('en');
    expect(readLocaleCookie()).toBe('en');

    writeLocaleCookie('ru');
    expect(readLocaleCookie()).toBe('ru');
  });

  it('should ignore a junk value', () => {
    document.cookie = `${LOCALE_COOKIE}=xx; path=/`;
    expect(readLocaleCookie()).toBeNull();
  });
});

describe('LOCALE_INIT_SCRIPT', () => {
  beforeEach(() => {
    clearCookie();
    window.localStorage.clear();
    document.documentElement.lang = 'ru';
  });

  const run = (): void => {
    new Function(LOCALE_INIT_SCRIPT)();
  };

  it('should set <html lang> from the cookie before first paint', () => {
    writeLocaleCookie('en');

    run();

    expect(document.documentElement.lang).toBe('en');
  });

  it('should prefer the cookie over the stored locale', () => {
    writeLocaleCookie('ru');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    run();

    expect(document.documentElement.lang).toBe('ru');
  });

  it('should fall back to the stored locale when there is no cookie', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    run();

    expect(document.documentElement.lang).toBe('en');
  });

  it('should leave the default language when neither holds a valid locale', () => {
    document.cookie = `${LOCALE_COOKIE}=xx; path=/`;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'junk');

    run();

    expect(document.documentElement.lang).toBe('ru');
  });
});
