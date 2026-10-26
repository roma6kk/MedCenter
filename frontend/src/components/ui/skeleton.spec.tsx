import { render } from '@testing-library/react';
import { Skeleton, SkeletonText } from './skeleton';

describe('Skeleton', () => {
  it('should shimmer instead of pulsing and stay out of the accessibility tree', () => {
    const { container } = render(<Skeleton className="h-8 w-40" />);

    const node = container.firstElementChild;
    expect(node).toHaveClass('skeleton', 'h-8', 'w-40');
    expect(node).not.toHaveClass('animate-pulse');
    expect(node).toHaveAttribute('aria-hidden', 'true');
  });

  it('should take the shape of a circle for a portrait', () => {
    const { container } = render(<Skeleton shape="circle" />);

    expect(container.firstElementChild).toHaveClass('rounded-full');
  });

  it('should draw the requested number of lines with a shorter last one when it is text', () => {
    const { container } = render(<SkeletonText lines={4} />);

    const lines = container.querySelectorAll('.skeleton');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveClass('w-2/3');
  });
});
