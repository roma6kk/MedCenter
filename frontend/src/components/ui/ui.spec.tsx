import { render, screen } from '@testing-library/react';
import { Button } from './button';
import { buttonVariants } from './button-variants';
import { Card } from './card';

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
