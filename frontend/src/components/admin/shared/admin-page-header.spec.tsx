import { render, screen } from '@testing-library/react';
import { AdminPageHeader } from './admin-page-header';

describe('AdminPageHeader', () => {
  it('should name the browser tab after the screen and the brand when it is shown', () => {
    render(<AdminPageHeader title="Кабинеты" />);

    expect(document.title).toBe('Кабинеты — Лайфлайн');
  });

  it('should put the previous title back when the screen is left', () => {
    document.title = 'Медицинский центр';
    const { unmount } = render(<AdminPageHeader title="Услуги" />);

    unmount();

    expect(document.title).toBe('Медицинский центр');
  });

  it('should show the title as the page heading with its description and action when they are given', () => {
    render(<AdminPageHeader title="Аудит" description="Кто и что изменил" action={<button type="button">Создать</button>} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Аудит' })).toBeInTheDocument();
    expect(screen.getByText('Кто и что изменил')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать' })).toBeInTheDocument();
  });
});
