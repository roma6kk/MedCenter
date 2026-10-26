'use client';

import { useEffect } from 'react';
import { applyTheme, DARK_SCHEME_QUERY, readStoredThemeMode } from '@/lib/theme/theme';
import { useUiStore } from '@/store/use-ui-store';

/**
 * Keeps the store and `<html data-theme>` in step after hydration. The head script already painted the right theme, so
 * nothing is applied on mount: the saved mode only goes into the store (reading storage during render would mismatch the
 * server HTML). In the system mode it follows later changes of the OS scheme.
 */
export function ThemeSync(): null {
  const mode = useUiStore((state) => state.themeMode);
  useEffect(() => {
    const stored = readStoredThemeMode();
    if (stored !== null) useUiStore.setState({ themeMode: stored });
  }, []);
  useEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const onChange = (): void => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);
  return null;
}
