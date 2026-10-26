import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'role'> {
  /** The text beside the switch; the whole row is one label and one 44 px target. */
  readonly children: ReactNode;
  readonly wrapperClassName?: string;
}

/**
 * An on/off switch (VF1) on a native checkbox with `role="switch"`: the state is announced as «on/off», `register()` and
 * `checked` work as for any checkbox, Space toggles. The thumb slides with the motion tokens; reduced motion stops it
 * globally. The track is the primary colour when on and the field border colour when off (>= 3:1 on the card).
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch({ children, wrapperClassName, className, ...rest }, ref): ReactNode {
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 py-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60', wrapperClassName)}>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className={cn(
            'peer h-6 w-11 cursor-pointer appearance-none rounded-full border border-input bg-secondary',
            'transition-[background-color,border-color,box-shadow] duration-fast ease-out',
            'checked:border-primary checked:bg-primary',
            'focus-visible:border-primary focus-visible:shadow-focus focus-visible:outline-transparent focus-visible:outline-offset-0',
            'disabled:cursor-not-allowed',
            className,
          )}
          {...rest}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1 size-4 rounded-full bg-muted-foreground shadow-elev-1 transition-[transform,background-color] duration-base ease-out peer-checked:translate-x-5 peer-checked:bg-primary-foreground"
        />
      </span>
      <span className="text-base text-foreground">{children}</span>
    </label>
  );
});
