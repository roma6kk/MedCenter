import { render } from '@testing-library/react';
import { HeroEcg } from './hero-ecg';

describe('HeroEcg', () => {
  it('should be decoration that assistive technology skips', () => {
    const { container } = render(<HeroEcg />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it('should draw its line once with the stroke animation and not loop it', () => {
    const { container } = render(<HeroEcg />);

    const path = container.querySelector('path') as SVGPathElement;

    expect(path).toHaveClass('animate-ecg-draw');
    expect(path).toHaveAttribute('pathLength', '1');
    expect(path.className.baseVal).not.toMatch(/infinite/);
  });
});
