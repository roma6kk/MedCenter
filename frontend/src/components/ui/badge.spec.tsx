import { render, screen } from '@testing-library/react';
import { CircleCheck } from 'lucide-react';
import { Badge, badgeVariants, type BadgeTone } from './badge';

const TONES: ReadonlyArray<BadgeTone> = ['neutral', 'info', 'success', 'warning', 'critical', 'primary', 'warm'];

describe('Badge', () => {
  it.each(TONES)('should give the %s tone a soft ground and its own text colour', (tone) => {
    const classes: string = badgeVariants({ tone });

    expect(classes).toMatch(/bg-(secondary|info-soft|success-soft|warning-soft|destructive-soft|primary-soft|warm-soft)/);
    expect(classes).toMatch(/text-/);
  });

  it('should spell the status out in words and hide its icon from assistive technology when an icon is given', () => {
    const { container } = render(<Badge tone="success" icon={CircleCheck}>Действует</Badge>);

    expect(screen.getByText('Действует')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('should be a pill by default and a small rounded tag when the shape is tag', () => {
    render(<><Badge>Пилюля</Badge><Badge shape="tag">Тег</Badge></>);

    expect(screen.getByText('Пилюля')).toHaveClass('rounded-full');
    expect(screen.getByText('Тег')).toHaveClass('rounded');
  });

  it('should pass test ids and titles through to the element', () => {
    render(<Badge data-testid="b" title="подсказка">x</Badge>);

    expect(screen.getByTestId('b')).toHaveAttribute('title', 'подсказка');
  });
});
