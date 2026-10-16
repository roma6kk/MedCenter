import { create } from 'zustand';
import { DEFAULT_LOCALE, storeLocale, type Locale } from '@/lib/i18n/locale';

interface UiState {
  readonly locale: Locale;
  readonly sidebarCollapsed: boolean;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  locale: DEFAULT_LOCALE,
  sidebarCollapsed: false,
  setLocale: (locale) => {
    storeLocale(locale);
    set({ locale });
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
