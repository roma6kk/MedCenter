import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Look of every button and button-like link of the redesign. Kept out of the component file so a `Link` can wear it too
 * (`<Link className={buttonVariants({ variant: 'primary' })}>`), and so Fast Refresh keeps `button.tsx` components-only.
 * Every size is at least 44 px tall (WCAG 2.5.8).
 *
 * Motion: only the four properties that actually change are transitioned (never `all`), with the ease-out curve and the fast
 * duration of the motion tokens; a press scales the button down a little. Hover has its own colour per variant, because
 * `opacity-90` made the label itself fainter. The global `prefers-reduced-motion` rule in `globals.css` switches the
 * transition off, so the press feedback stays but turns instant.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-[background-color,color,box-shadow,transform] duration-fast ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:active:scale-100',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-strong',
        secondary: 'border border-border bg-card text-foreground hover:bg-secondary',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft-hover',
        // The confirm button of a destructive dialog: the one place where the red is solid (VA2). Elsewhere a destructive action is `quiet-danger` text.
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        // The secondary form of a destructive action in a list or a block: red text and an icon, no ground until hovered.
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
