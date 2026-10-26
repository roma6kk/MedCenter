import { applyTheme, DARK_SCHEME_QUERY, readStoredThemeMode, resolveTheme, storeThemeMode, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

/** Replaces `window.matchMedia` with a fake whose dark-scheme query reports `dark`; `undefined` removes the API. */
function mockSystemScheme(dark: boolean | undefined): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: dark === undefined ? undefined : (query: string): Partial<MediaQueryList> => ({ matches: query === DARK_SCHEME_QUERY && dark, media: query }),
  });
}

/** Runs the head script the way the browser does: as a classic script against the current `window`. */
function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset['theme'];
    mockSystemScheme(false);
  });

  describe('resolveTheme', () => {
    it('should return the mode itself when it is light or dark', () => {
      mockSystemScheme(true);

      expect(resolveTheme('light')).toBe('light');
      expect(resolveTheme('dark')).toBe('dark');
    });

    it.each([
      [true, 'dark'],
      [false, 'light'],
      [undefined, 'light'],
    ])('should follow the system when the mode is system and the system prefers dark is %s', (systemDark, expected) => {
      mockSystemScheme(systemDark);

      expect(resolveTheme('system')).toBe(expected);
    });
  });

  describe('storage', () => {
    it('should round-trip the mode when storage works', () => {
      storeThemeMode('dark');

      expect(readStoredThemeMode()).toBe('dark');
    });

    it('should return null when the stored value is junk', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

      expect(readStoredThemeMode()).toBeNull();
    });

    it('should return null and not throw when storage is blocked', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(readStoredThemeMode()).toBeNull();
      expect(() => storeThemeMode('light')).not.toThrow();
      jest.restoreAllMocks();
    });
  });

  it('should write the resolved theme to the html element when it is applied', () => {
    mockSystemScheme(true);

    applyTheme('system');

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  describe('THEME_INIT_SCRIPT', () => {
    it.each([
      ['dark', false, 'dark'],
      ['light', true, 'light'],
      ['system', true, 'dark'],
      ['system', false, 'light'],
      [null, true, 'dark'],
      ['junk', true, 'dark'],
      ['junk', false, 'light'],
    ])('should set data-theme before paint when the stored mode is %s and the system prefers dark is %s', (stored, systemDark, expected) => {
      if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      mockSystemScheme(systemDark);

      runInitScript();

      expect(document.documentElement.dataset['theme']).toBe(expected);
    });

    it('should fall back to light and not throw when storage and matchMedia are both unavailable', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      mockSystemScheme(undefined);

      expect(runInitScript).not.toThrow();
      expect(document.documentElement.dataset['theme']).toBe('light');
      jest.restoreAllMocks();
    });
  });
});
