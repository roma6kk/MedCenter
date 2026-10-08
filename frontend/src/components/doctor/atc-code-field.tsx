import { forwardRef } from 'react';
import type { ChangeEvent, InputHTMLAttributes } from 'react';

/**
 * АТХ (ATC) code input: monospace, upper-cased as typed. Format validation stays in the
 * zod schema (`ATC_PATTERN` in lib/contracts); this field only shapes the input.
 * Forwards its ref and props so it works with react-hook-form `register`.
 */
export const AtcCodeField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function AtcCodeField(
  { onChange, className, ...rest },
  ref,
) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    event.target.value = event.target.value.toUpperCase();
    onChange?.(event);
  };

  return (
    <input
      ref={ref}
      {...rest}
      onChange={handleChange}
      maxLength={7}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="characters"
      className={`mono mt-1 w-full rounded-[6px] border border-[var(--input)] p-2 ${className ?? ''}`.trim()}
    />
  );
});
