import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Look of every button and button-like link of the redesign. Kept out of the component file so a `Link` can wear it too
 * (`<Link className={buttonVariants({ variant: 'primary' })}>`), and so Fast Refresh keeps `button.tsx` components-only.
 * Every size is at least 44 px tall (WCAG 2.5.8).
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'border border-border bg-card text-foreground hover:bg-secondary',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:opacity-90',
        danger: 'bg-destructive-soft text-destructive hover:opacity-90',
        ghost: 'text-foreground hover:bg-secondary',
        inverse: 'bg-card text-primary-soft-foreground hover:opacity-90',
      },
      size: {
        md: 'min-h-[44px] px-4 text-sm',
        lg: 'min-h-[52px] px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
