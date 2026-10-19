'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { UCUM_UNITS } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { UCUM_VALUE_SET } from './doctor-api';
import { ValueSetSelect } from './value-set-select';

interface UcumUnitSelectProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (unit: string) => void;
  readonly onBlur?: () => void;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
}

/**
 * UCUM unit picker. Select-only by design (BR-009): the options are the `ucum-units` ValueSet of the terminology service,
 * and the short contracts list when that service cannot be reached. Free text is never accepted.
 */
export const UcumUnitSelect = forwardRef<HTMLSelectElement, UcumUnitSelectProps>(function UcumUnitSelect({ onChange, ...rest }, ref): ReactNode {
  const t = useT('doctor.ucum');
  return (
    <ValueSetSelect
      ref={ref}
      {...rest}
      valueSet={UCUM_VALUE_SET}
      placeholder={t('placeholder')}
      fallbackCodes={UCUM_UNITS}
      onChange={(term) => onChange(term?.code ?? '')}
    />
  );
});
