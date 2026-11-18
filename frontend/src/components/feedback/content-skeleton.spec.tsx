import { render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { ContentSkeleton } from './content-skeleton';

describe('ContentSkeleton', () => {
  beforeEach(() => useUiStore.setState({ locale: 'ru' }));

  it('should announce the loading once and hide its decoration from assistive technology', () => {
    render(<ContentSkeleton shape="list" />);

    const region = screen.getByRole('status');

    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveTextContent('Загрузка…');
    expect(region.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it.each(['list', 'tiles', 'timeline', 'cards', 'detail'] as const)('should draw the %s shape', (shape) => {
    render(<ContentSkeleton shape={shape} />);

    expect(screen.getByTestId(`content-skeleton-${shape}`)).toBeInTheDocument();
  });

  it('should draw the requested number of rows when it is a list', () => {
    render(<ContentSkeleton shape="list" rows={4} />);

    expect(screen.getByTestId('content-skeleton-list').querySelectorAll('[data-skeleton-row]')).toHaveLength(4);
  });
});
