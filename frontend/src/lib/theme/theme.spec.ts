import { applyTheme, DARK_SCHEME_QUERY, readStoredThemeMode, resolveTheme, storeThemeMode, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

function mockSystemScheme(dark: boolean | undefined): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: dark === undefined ? undefined : (query: string): Partial<MediaQueryList> => ({ matches: query === DARK_SCHEME_QUERY && dark, media: query }),
  });
}

function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['themeSwitching'];
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

  describe('switching without transitions', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('should turn every transition off while the theme is written and lift that on the next tick', () => {
      applyTheme('dark');

      expect(document.documentElement).toHaveAttribute('data-theme-switching');
      expect(document.documentElement.dataset['theme']).toBe('dark');

      jest.runOnlyPendingTimers();

      expect(document.documentElement).not.toHaveAttribute('data-theme-switching');
      expect(document.documentElement.dataset['theme']).toBe('dark');
    });

    it('should force a layout with the new theme written and the transitions still off, before they come back', () => {
      const root = document.documentElement;
      const seen: Array<{ readonly isSwitching: boolean; readonly theme: string | undefined }> = [];
      jest.spyOn(root, 'getBoundingClientRect').mockImplementation(() => {
        seen.push({ isSwitching: root.hasAttribute('data-theme-switching'), theme: root.dataset['theme'] });
        return {} as DOMRect;
      });

      applyTheme('dark');

      expect(seen).toEqual([{ isSwitching: true, theme: 'dark' }]);
    });

    it('should keep the transitions off until the last of two switches in the same instant is written', () => {
      applyTheme('dark');
      applyTheme('light');

      expect(jest.getTimerCount()).toBe(1);

      jest.runOnlyPendingTimers();

      expect(document.documentElement).not.toHaveAttribute('data-theme-switching');
      expect(document.documentElement.dataset['theme']).toBe('light');
    });
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

    it('should not switch the transitions off, since nothing eases before the first paint', () => {
      runInitScript();

      expect(document.documentElement).not.toHaveAttribute('data-theme-switching');
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
