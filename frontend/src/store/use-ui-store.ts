import { create } from 'zustand';

interface UiState {
  readonly locale: 'ru' | 'en';
  readonly sidebarCollapsed: boolean;
  setLocale: (locale: 'ru' | 'en') => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  locale: 'ru',
  sidebarCollapsed: false,
  setLocale: (locale) => set({ locale }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
