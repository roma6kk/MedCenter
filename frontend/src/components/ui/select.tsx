import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { FIELD_CLASS } from './field-styles';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, wrapperClassName, children, ...rest }, ref): ReactNode {
  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select ref={ref} className={cn(FIELD_CLASS, 'cursor-pointer appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});
