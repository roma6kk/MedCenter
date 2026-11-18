import { render, screen } from '@testing-library/react';
import { PageTransition } from './page-transition';

const mockPathname = jest.fn<string | null, []>();
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

describe('PageTransition', () => {
  it('should not animate the page that the visitor lands on', () => {
    mockPathname.mockReturnValue('/appointments');

    render(<PageTransition><p>список</p></PageTransition>);

    expect(screen.getByText('список').parentElement).not.toHaveClass('animate-fade-in');
  });

  it('should fade the new page in when the route changes', () => {
    mockPathname.mockReturnValue('/appointments');
    const { rerender } = render(<PageTransition><p>список</p></PageTransition>);

    mockPathname.mockReturnValue('/medcard');
    rerender(<PageTransition><p>карта</p></PageTransition>);

    expect(screen.getByText('карта').parentElement).toHaveClass('animate-fade-in');
  });

  it('should keep the animation when the visitor returns to the page where they started', () => {
    mockPathname.mockReturnValue('/appointments');
    const { rerender } = render(<PageTransition><p>a</p></PageTransition>);
    mockPathname.mockReturnValue('/medcard');
    rerender(<PageTransition><p>b</p></PageTransition>);

    mockPathname.mockReturnValue('/appointments');
    rerender(<PageTransition><p>a</p></PageTransition>);

    expect(screen.getByText('a').parentElement).toHaveClass('animate-fade-in');
  });
});
