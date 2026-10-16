import { render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { EmptyState, ForbiddenState, NotFoundState, TableSkeleton } from './states';

describe('system states', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should render the forbidden state with its explanation and action', () => {
    render(<ForbiddenState title="Раздел недоступен" action={<a href="/">На главную</a>} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Недостаточно прав' })).toBeInTheDocument();
    expect(screen.getByText('Раздел недоступен')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toBeInTheDocument();
  });

  it('should render the not-found state', () => {
    render(<NotFoundState title="Такой записи нет" description="Проверьте ссылку" />);

    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Не найдено');
    expect(screen.getByText('Проверьте ссылку')).toBeInTheDocument();
  });

  it('should localize the headings to English', () => {
    useUiStore.setState({ locale: 'en' });

    render(<ForbiddenState title="x" />);

    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('should render the empty state with an optional action', () => {
    render(<EmptyState title="Нет уведомлений" action={<button type="button">Обновить</button>} />);

    expect(screen.getByRole('heading', { name: 'Нет уведомлений' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
  });

  it('should announce the loading skeleton to screen readers', () => {
    render(<TableSkeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });
});
