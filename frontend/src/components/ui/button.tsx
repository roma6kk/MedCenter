import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';
import { buttonVariants, type ButtonVariantProps } from './button-variants';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps;

/** `<button>` of the redesign; `type` defaults to "button" so a button inside a form never submits by accident. */
export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps): ReactNode {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest} />;
}
