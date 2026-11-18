import { render, screen } from '@testing-library/react';
import { Button } from './button';
import { buttonVariants } from './button-variants';
import { Card } from './card';
import { cardVariants, STRETCHED_LINK_CLASS } from './card-variants';

describe('Button', () => {
  it('should not submit a form by default when it is placed inside one', () => {
    render(<form><Button>Сохранить</Button></form>);

    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveAttribute('type', 'button');
  });

  it('should let a caller class override a size utility when both set the same property', () => {
    render(<Button size="md" className="px-8">Далее</Button>);

    const button = screen.getByRole('button', { name: 'Далее' });
    expect(button).toHaveClass('px-8');
    expect(button).not.toHaveClass('px-4');
  });

  it('should be at least 44 px tall in every size when WCAG 2.5.8 applies', () => {
    expect(buttonVariants({ size: 'md' })).toContain('min-h-[44px]');
    expect(buttonVariants({ size: 'lg' })).toContain('min-h-[52px]');
  });

  it('should use the primary variant when no variant is given', () => {
    expect(buttonVariants()).toContain('bg-primary');
  });
});

describe('Card', () => {
  it('should render the element it is asked for when `as` is set', () => {
    render(<Card as="article" aria-label="Карточка">текст</Card>);

    expect(screen.getByRole('article', { name: 'Карточка' })).toHaveTextContent('текст');
  });

  it('should round a panel more than a card when the radius is panel', () => {
    render(<Card radius="panel" data-testid="panel">p</Card>);

    expect(screen.getByTestId('panel')).toHaveClass('rounded-panel');
  });
});

describe('Card tones', () => {
  it('should lift an interactive card on hover, show the pointer and a focus ring (VD2)', () => {
    render(<Card tone="interactive" data-testid="card">c</Card>);

    expect(screen.getByTestId('card')).toHaveClass('cursor-pointer', 'hover:-translate-y-0.5', 'hover:shadow-elev-2', 'has-[:focus-visible]:ring-2');
  });

  it('should leave a static card flat when it only holds content', () => {
    render(<Card data-testid="card">c</Card>);

    expect(screen.getByTestId('card')).not.toHaveClass('cursor-pointer');
    expect(screen.getByTestId('card')).not.toHaveClass('hover:-translate-y-0.5');
  });

  it('should ring a selected card in the primary colour on a soft ground', () => {
    render(<Card tone="selected" data-testid="card">c</Card>);

    expect(screen.getByTestId('card')).toHaveClass('ring-2', 'ring-primary', 'bg-primary-soft');
  });

  it('should transition only the properties that change when the tone is interactive', () => {
    expect(cardVariants({ tone: 'interactive' })).toContain('transition-[transform,box-shadow,border-color]');
    expect(cardVariants({ tone: 'interactive' })).not.toContain('transition-all');
  });

  it('should be wearable by a link when the whole card is the link', () => {
    render(<a href="/x" className={cardVariants({ tone: 'interactive' })}>ссылка</a>);

    expect(screen.getByRole('link', { name: 'ссылка' })).toHaveClass('rounded-card');
    expect(STRETCHED_LINK_CLASS).toContain('after:inset-0');
  });
});

describe('Button destructive variants', () => {
  it('should make the confirm button solid red and the in-list action red text without a ground', () => {
    expect(buttonVariants({ variant: 'destructive' })).toContain('bg-destructive');
    expect(buttonVariants({ variant: 'destructive' })).toContain('text-destructive-foreground');
    expect(buttonVariants({ variant: 'quiet-danger' })).toContain('text-destructive');
    expect(buttonVariants({ variant: 'quiet-danger' })).not.toMatch(/(^| )bg-destructive( |$)/);
  });
});
