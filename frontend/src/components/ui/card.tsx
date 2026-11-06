import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { cardVariants, type CardVariantProps } from './card-variants';

type CardProps = HTMLAttributes<HTMLElement> & CardVariantProps & { readonly as?: 'div' | 'article' | 'section' | 'li' };

export function Card({ as: Tag = 'div', radius, padding, tone, className, ...rest }: CardProps): ReactNode {
  return <Tag className={cn(cardVariants({ radius, padding, tone }), className)} {...rest} />;
}
