'use client';

import { useEffect } from 'react';
import { applyTheme, DARK_SCHEME_QUERY, readStoredThemeMode } from '@/lib/theme/theme';
import { useUiStore } from '@/store/use-ui-store';

// Nothing is applied on mount (the head script already painted); reading storage during render would mismatch the server HTML.
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
