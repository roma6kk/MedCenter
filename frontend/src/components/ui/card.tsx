import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { cardVariants, type CardVariantProps } from './card-variants';

type CardProps = HTMLAttributes<HTMLElement> & CardVariantProps & { readonly as?: 'div' | 'article' | 'section' | 'li' };

/**
 * Surface of the redesign: card ground lifted by the resting shadow (`--shadow-1`) with a light hairline (the dark theme
 * keeps the full hairline, see `--border-soft`), rounded like the design canvas (16 px, or 20 px for a panel).
 * `tone` is `static` (default), `interactive` (the whole card is a link or a button: give it a stretched link, see
 * `STRETCHED_LINK_CLASS` of card-variants) or `selected`.
 */
export function Card({ as: Tag = 'div', radius, padding, tone, className, ...rest }: CardProps): ReactNode {
  return <Tag className={cn(cardVariants({ radius, padding, tone }), className)} {...rest} />;
}
