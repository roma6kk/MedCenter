import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/store/use-ui-store';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from './route-pages';

describe('route pages', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
    document.title = 'Медицинский центр';
  });

  describe.each([
    ['NotFoundPage', <NotFoundPage key="nf" />],
    ['ForbiddenPage', <ForbiddenPage key="fb" />],
    ['RouteErrorPage', <RouteErrorPage key="er" error={new Error('boom')} reset={jest.fn()} />],
  ])('%s', (_name, page) => {
    it('should render exactly one skip link that targets the main landmark when it is shown', () => {
      render(page);

      const skipLinks = screen.getAllByRole('link', { name: 'Перейти к содержимому' });
      expect(skipLinks).toHaveLength(1);
      expect(skipLinks[0]).toHaveAttribute('href', '#main-content');
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    });

    it('should name the tab in the language of the interface when it is shown', () => {
      useUiStore.setState({ locale: 'en' });

      render(page);

      expect(document.title).toMatch(/ — MedCenter$/);
      expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    });
  });

  it('should say the page was not found and link home when the URL matches no route', () => {
    render(<NotFoundPage />);

    expect(document.title).toBe('Страница не найдена — МедЦентр');
    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Страница не найдена');
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });

  it('should translate the not-found text to English when the interface is English', () => {
    useUiStore.setState({ locale: 'en' });

    render(<NotFoundPage />);

    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Page not found');
    expect(screen.getByRole('link', { name: 'Back home' })).toBeInTheDocument();
  });

  it('should explain that the section is not for this role when the guard sent the user here', () => {
    render(<ForbiddenPage />);

    expect(document.title).toBe('Недостаточно прав — МедЦентр');
    expect(screen.getByTestId('forbidden-state')).toHaveTextContent('Этот раздел недоступен для вашей роли.');
  });

  it('should show the crash and let the user try again when the page failed', async () => {
    const reset = jest.fn();
    render(<RouteErrorPage error={new Error('boom')} reset={reset} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Что-то пошло не так');
    expect(screen.getByTestId('problem-banner')).toHaveTextContent('boom');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
