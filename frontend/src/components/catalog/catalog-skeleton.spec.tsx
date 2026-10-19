import { render, screen } from '@testing-library/react';
import { CatalogSkeleton } from './catalog-skeleton';

describe('CatalogSkeleton', () => {
  it('should announce the loading state and show six placeholder cards when the catalog is loading', () => {
    render(<CatalogSkeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-skeleton').querySelectorAll('.h-24')).toHaveLength(6);
  });
});
