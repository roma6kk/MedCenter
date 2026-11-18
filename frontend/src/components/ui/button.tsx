import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { buttonVariants, type ButtonVariantProps } from './button-variants';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps;

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps): ReactNode {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
}
