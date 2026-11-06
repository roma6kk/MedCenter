import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from '@/lib/theme/theme';
import { useUiStore } from '@/store/use-ui-store';
import { ThemeSwitcher } from './theme-switcher';
import { ThemeSync } from './theme-sync';

type Listener = () => void;

function installSystemScheme(initialDark: boolean): { setSystemDark: (dark: boolean) => void } {
  let dark: boolean = initialDark;
  const listeners = new Set<Listener>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): Partial<MediaQueryList> => ({
      get matches(): boolean {
        return query === DARK_SCHEME_QUERY && dark;
      },
      addEventListener: (_type: string, listener: unknown): void => {
        listeners.add(listener as Listener);
      },
      removeEventListener: (_type: string, listener: unknown): void => {
        listeners.delete(listener as Listener);
      },
    }),
  });
  return {
    setSystemDark: (next: boolean): void => {
      dark = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const theme = (): string | undefined => document.documentElement.dataset['theme'];

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset['theme'];
    useUiStore.setState({ locale: 'ru', themeMode: 'system' });
    installSystemScheme(false);
  });

  it('should mark the active mode as pressed and name the group when it renders', () => {
    render(<ThemeSwitcher />);

    expect(screen.getByRole('group', { name: 'Тема оформления' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Как в системе' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should switch to dark, mark it pressed and remember the choice when the dark segment is clicked', async () => {
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Тёмная' }));

    expect(theme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Как в системе' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should force light even when the system prefers dark when the light segment is clicked', async () => {
    installSystemScheme(true);
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Светлая' }));

    expect(theme()).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('should fall back to the system scheme when the system segment is clicked after a forced mode', async () => {
    installSystemScheme(true);
    useUiStore.setState({ themeMode: 'light' });
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Как в системе' }));

    expect(theme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('should label the segments in English when the locale is en', () => {
    useUiStore.setState({ locale: 'en' });
    render(<ThemeSwitcher />);

    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });

  it('should render one button that names the current mode and cycles system, light, dark when it is compact', async () => {
    render(<ThemeSwitcher compact />);

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Тема оформления: Как в системе. Переключить' });

    await userEvent.click(button);
    expect(theme()).toBe('light');
    expect(screen.getByRole('button', { name: 'Тема оформления: Светлая. Переключить' })).toBeInTheDocument();

    await userEvent.click(button);
    expect(theme()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await userEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('should keep working when storage is blocked and just not remember the choice', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'Тёмная' }));

    expect(theme()).toBe('dark');
    jest.restoreAllMocks();
  });
});

describe('ThemeSync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset['theme'];
    useUiStore.setState({ themeMode: 'system' });
  });

  it('should restore the saved mode into the store without touching the painted theme when it mounts', () => {
    installSystemScheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    document.documentElement.dataset['theme'] = 'dark';

    render(<ThemeSync />);

    expect(useUiStore.getState().themeMode).toBe('dark');
    expect(theme()).toBe('dark');
  });

  it('should follow the OS scheme while the mode is system when the scheme changes', () => {
    const system = installSystemScheme(false);
    render(<ThemeSync />);

    act(() => system.setSystemDark(true));
    expect(theme()).toBe('dark');

    act(() => system.setSystemDark(false));
    expect(theme()).toBe('light');
  });

  it('should ignore the OS scheme when the mode is forced', () => {
    const system = installSystemScheme(false);
    useUiStore.setState({ themeMode: 'light' });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    document.documentElement.dataset['theme'] = 'light';
    render(<ThemeSync />);

    act(() => system.setSystemDark(true));

    expect(theme()).toBe('light');
  });
});
