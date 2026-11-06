import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  readonly children?: ReactNode;
  readonly wrapperClassName?: string;
}

const BOX_CLASS = [
  'peer size-[22px] shrink-0 cursor-pointer appearance-none rounded border border-input bg-card',
  'transition-[background-color,border-color,box-shadow] duration-fast ease-out',
  'checked:border-primary checked:bg-primary',
  'focus-visible:border-primary focus-visible:shadow-focus focus-visible:outline-transparent focus-visible:outline-offset-0',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:shadow-focus-danger',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ children, wrapperClassName, className, ...rest }, ref): ReactNode {
  const box: ReactNode = (
    <span className={cn('relative inline-flex size-[22px] shrink-0', children === undefined && wrapperClassName)}>
      <input ref={ref} type="checkbox" className={cn(BOX_CLASS, className)} {...rest} />
      <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  );
  if (children === undefined) return box;
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 py-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60', wrapperClassName)}>
      {box}
      <span className="text-base text-foreground">{children}</span>
    </label>
  );
});
