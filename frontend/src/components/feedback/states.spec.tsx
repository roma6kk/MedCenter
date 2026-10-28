import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { EmptyState, ForbiddenState, NotFoundState, TableSkeleton } from './states';

describe('system states', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should render the forbidden state with its explanation and action', () => {
    render(<ForbiddenState title="Раздел недоступен" action={<Link href="/">На главную</Link>} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Недостаточно прав' })).toBeInTheDocument();
    expect(screen.getByText('Раздел недоступен')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toBeInTheDocument();
  });

  it('should render the not-found state', () => {
    render(<NotFoundState title="Такой записи нет" description="Проверьте ссылку" />);

    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Не найдено');
    expect(screen.getByText('Проверьте ссылку')).toBeInTheDocument();
  });

  it('should draw an icon above an empty state only when one is given', () => {
    const { unmount } = render(<EmptyState title="Пусто" />);
    expect(screen.queryByTestId('empty-state-icon')).not.toBeInTheDocument();
    unmount();

    render(<EmptyState icon={CalendarPlus} title="Записей нет" description="Запишитесь на приём" action={<button type="button">Записаться</button>} />);

    expect(screen.getByTestId('empty-state-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Записей нет' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Записаться' })).toBeInTheDocument();
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
