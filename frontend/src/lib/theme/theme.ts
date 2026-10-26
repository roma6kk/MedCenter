/** theme — colour theme modes (system / light / dark), their per-viewer persistence and the no-flash bootstrap script. */

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ReadonlyArray<ThemeMode> = ['system', 'light', 'dark'];
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const THEME_STORAGE_KEY = 'mc-theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Stored mode, or `null` when storage is empty, blocked (private window) or holds junk. */
export function readStoredThemeMode(): ThemeMode | null {
  try {
    const stored: string | null = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    // Storage can throw (blocked site data, private mode): the page then follows the system.
    return null;
  }
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Not persisting the choice is harmless: the next visit starts in the system mode.
  }
}

/** Whether the system asks for a dark scheme; `false` where `matchMedia` is missing. */
export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

/** The theme that is actually painted: the system mode resolves through `prefers-color-scheme`. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** Writes the resolved theme to `<html data-theme>`, the single hook of the dark token set in `globals.css`. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset['theme'] = resolveTheme(mode);
}

/**
 * Inline script for `<head>`: sets `data-theme` before the first paint, so a dark-theme visitor never sees a light flash.
 * It runs before React and shares no code with the bundle, so it repeats the rule of `resolveTheme` (an unknown or missing
 * stored value means «system»); `theme.spec.ts` runs it against the same cases. The CSP of `next.config.mjs` allows it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=null;try{m=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});}catch(e){}var d=m==='dark'||(m!=='light'&&typeof window.matchMedia==='function'&&window.matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
