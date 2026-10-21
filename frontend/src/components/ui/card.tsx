import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/ui/cn';

const cardVariants = cva('border border-border bg-card', {
  variants: {
    radius: { card: 'rounded-card', panel: 'rounded-panel' },
    padding: { none: '', md: 'p-5', lg: 'p-6' },
  },
  defaultVariants: { radius: 'card', padding: 'md' },
});

type CardProps = HTMLAttributes<HTMLElement> & VariantProps<typeof cardVariants> & { readonly as?: 'div' | 'article' | 'section' | 'li' };

/** Surface of the redesign: hairline border, card ground, rounded like the design canvas (16 px, or 20 px for a panel). */
export function Card({ as: Tag = 'div', radius, padding, className, ...rest }: CardProps): ReactNode {
  return <Tag className={cn(cardVariants({ radius, padding }), className)} {...rest} />;
}
