import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { FIELD_CLASS } from './field-styles';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes of the box around the select (width, margin): the chevron is placed against it. */
  readonly wrapperClassName?: string;
}

/**
 * A themed native `<select>` (VF1): the browser's own arrow is replaced by a chevron that follows the theme, the field takes
 * the shared field look and focus halo, and everything else stays native: the mobile picker, keyboard search by typing,
 * screen readers, `register()` of react-hook-form, labels and `selectOptions` in tests. The chevron is decoration
 * (`pointer-events-none`, `aria-hidden`): the click goes to the select underneath.
 */
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
