import { render, screen } from '@testing-library/react';
import { QueryLoading } from './query-loading';

describe('QueryLoading', () => {
  it('should announce the loading state to assistive technology when a read is in flight', () => {
    render(<QueryLoading />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });

  it('should draw the requested number of placeholder rows when rows is given', () => {
    const { container } = render(<QueryLoading rows={5} />);

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });
});
