import { act, render, screen } from '@testing-library/react';
import { useToastStore } from '@/store/use-toast-store';
import { useUiStore } from '@/store/use-ui-store';
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
});
