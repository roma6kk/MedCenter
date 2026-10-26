import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/ui/cn';

/**
 * Semantic tones of the redesign (VA1): a soft ground with a coloured text, every pair checked for contrast in
 * `globals-contrast.spec.ts`. The tone is the urgency scale: neutral < info < success / warning < critical; `primary` and
 * `warm` are brand accents (a state that belongs to the clinic's own flow, a highlight for the patient side).
 */
export const badgeVariants = cva('inline-flex flex-none items-center gap-1 whitespace-nowrap text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-secondary text-muted-foreground',
      info: 'bg-info-soft text-info',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      critical: 'bg-destructive-soft text-destructive',
      primary: 'bg-primary-soft text-primary-soft-foreground',
      warm: 'bg-warm-soft text-warm-foreground',
    },
    shape: { pill: 'rounded-full px-2.5 py-1', tag: 'rounded px-2 py-0.5' },
  },
  defaultVariants: { tone: 'neutral', shape: 'pill' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** A lucide icon drawn before the label; it is decoration (the label always says the same in words), so it is hidden from assistive technology. */
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
}

/**
 * Status or category label. Meaning never rests on colour alone: the label is always spelled out and the optional icon
 * repeats the tone's shape (WCAG 1.4.1).
 */
export function Badge({ tone, shape, icon: Icon, className, children, ...rest }: BadgeProps): ReactNode {
  return (
    <span className={cn(badgeVariants({ tone, shape }), className)} {...rest}>
      {Icon === undefined ? null : <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.25} />}
      {children}
    </span>
  );
}
