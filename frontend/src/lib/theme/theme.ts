export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ReadonlyArray<ThemeMode> = ['system', 'light', 'dark'];
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const THEME_STORAGE_KEY = 'mc-theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readStoredThemeMode(): ThemeMode | null {
  try {
    const stored: string | null = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // storage blocked or full
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

let liftSwitching: ReturnType<typeof setTimeout> | undefined;

// data-theme-switching turns transitions off around the write so buttons never show the other theme's colours while easing.
export function applyTheme(mode: ThemeMode): void {
  const root: HTMLElement = document.documentElement;
  root.dataset['themeSwitching'] = '';
  root.dataset['theme'] = resolveTheme(mode);
  root.getBoundingClientRect();
  clearTimeout(liftSwitching);
  liftSwitching = setTimeout(() => {
    delete root.dataset['themeSwitching'];
  }, 0);
}

// Runs before React with no shared code, so it repeats the rule of resolveTheme; theme.spec.ts runs both against the same cases.
export const THEME_INIT_SCRIPT = `(function(){try{var m=null;try{m=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}var d=m==='dark'||(m!=='light'&&typeof window.matchMedia==='function'&&window.matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
