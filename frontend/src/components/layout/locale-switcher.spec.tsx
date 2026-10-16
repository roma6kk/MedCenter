import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LOCALE_STORAGE_KEY } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';
import { LocaleSwitcher } from './locale-switcher';

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState({ locale: 'ru' });
  });

  it('should mark the active locale as pressed', () => {
    render(<LocaleSwitcher />);

    expect(screen.getByRole('button', { name: 'ru' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'en' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should switch the locale and remember the choice for the next visit', async () => {
    render(<LocaleSwitcher />);

    await userEvent.click(screen.getByRole('button', { name: 'en' }));

    expect(useUiStore.getState().locale).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});
