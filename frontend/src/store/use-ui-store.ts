import { create } from 'zustand';
import { DEFAULT_LOCALE, storeLocale, type Locale } from '@/lib/i18n/locale';
import { applyTheme, DEFAULT_THEME_MODE, storeThemeMode, type ThemeMode } from '@/lib/theme/theme';

interface UiState {
  readonly locale: Locale;
  readonly themeMode: ThemeMode;
  readonly sidebarCollapsed: boolean;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  locale: DEFAULT_LOCALE,
  themeMode: DEFAULT_THEME_MODE,
  sidebarCollapsed: false,
  setLocale: (locale) => {
    storeLocale(locale);
    set({ locale });
  },
  setThemeMode: (mode) => {
    storeThemeMode(mode);
    applyTheme(mode);
    set({ themeMode: mode });
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
