import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-[background-color,color,box-shadow,transform] duration-fast ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-strong',
        secondary: 'border border-border bg-card text-foreground hover:bg-secondary',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft-hover',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        'quiet-danger': 'text-destructive hover:bg-destructive-soft',
        ghost: 'text-foreground hover:bg-secondary',
        inverse: 'bg-card text-primary-soft-foreground hover:bg-primary-soft',
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
