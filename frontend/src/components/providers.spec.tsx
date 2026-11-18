import { act, render, screen } from '@testing-library/react';
import { useToastStore } from '@/store/use-toast-store';
import { useUiStore } from '@/store/use-ui-store';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { LOCALE_COOKIE, readLocaleCookie } from '@/lib/i18n/locale';
import { Providers } from './providers';

jest.mock('@/lib/auth/session-client', () => ({ ensureSession: jest.fn().mockResolvedValue(undefined) }));

import { ensureSession } from '@/lib/auth/session-client';

const ensureSessionMock = ensureSession as jest.MockedFunction<typeof ensureSession>;

describe('Providers', () => {
  beforeEach(() => {
    ensureSessionMock.mockClear();
    window.localStorage.clear();
    useUiStore.setState({ locale: 'ru' });
    useToastStore.getState().clear();
  });

  it('should render its children and the toast region', () => {
    render(<Providers><p>страница</p></Providers>);

    expect(screen.getByText('страница')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should hydrate the session once on mount', () => {
    render(<Providers><p>x</p></Providers>);

    expect(ensureSessionMock).toHaveBeenCalledTimes(1);
  });

  it('should restore the locale the viewer chose on an earlier visit', () => {
    window.localStorage.setItem('mc-locale', 'en');

    render(<Providers><p>x</p></Providers>);

    expect(useUiStore.getState().locale).toBe('en');
  });

  it('should ignore a junk stored locale and keep the default', () => {
    window.localStorage.setItem('mc-locale', 'xx');

    render(<Providers><p>x</p></Providers>);

    expect(useUiStore.getState().locale).toBe('ru');
  });

  it('should keep the document language in step with the locale', () => {
    render(<Providers><p>x</p></Providers>);
    expect(document.documentElement.lang).toBe('ru');

    act(() => useUiStore.setState({ locale: 'en' }));

    expect(document.documentElement.lang).toBe('en');
  });

  describe('locale cookie for the server components', () => {
    const refresh = jest.fn();
    const router = { refresh } as unknown as AppRouterInstance;
    const mount = (): ReturnType<typeof render> =>
      render(
        <AppRouterContext.Provider value={router}>
          <Providers><p>x</p></Providers>
        </AppRouterContext.Provider>,
      );

    beforeEach(() => {
      refresh.mockClear();
      document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
    });

    it('should write the cookie and refresh the route when the viewer switches the language', () => {
      mount();
      expect(refresh).not.toHaveBeenCalled();

      act(() => useUiStore.getState().setLocale('en'));

      expect(readLocaleCookie()).toBe('en');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('should not refresh when the cookie already carries the locale restored from storage', () => {
      document.cookie = `${LOCALE_COOKIE}=en; path=/`;
      window.localStorage.setItem('mc-locale', 'en');

      mount();

      expect(useUiStore.getState().locale).toBe('en');
      expect(refresh).not.toHaveBeenCalled();
    });

    it('should set the cookie of a viewer who chose a language before it existed', () => {
      window.localStorage.setItem('mc-locale', 'en');

      mount();

      expect(readLocaleCookie()).toBe('en');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('should not fail where no router is mounted', () => {
      render(<Providers><p>x</p></Providers>);

      expect(() => act(() => useUiStore.getState().setLocale('en'))).not.toThrow();
    });
  });
});
