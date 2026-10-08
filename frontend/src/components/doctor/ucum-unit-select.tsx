import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { UCUM_UNITS } from '@/lib/contracts';

/**
 * UCUM unit picker. Select-only by design (BR-009): free-text units are refused.
 * Options come from the contracts snapshot; the server remains the source of truth.
 */
export const UcumUnitSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function UcumUnitSelect(
  { className, ...rest },
  ref,
) {
  return (
    <select ref={ref} {...rest} className={`mt-1 w-full rounded-[6px] border border-[var(--input)] p-2 ${className ?? ''}`.trim()}>
      {UCUM_UNITS.map((unit) => (
        <option key={unit} value={unit}>
          {unit}
        </option>
      ))}
    </select>
  );
});
