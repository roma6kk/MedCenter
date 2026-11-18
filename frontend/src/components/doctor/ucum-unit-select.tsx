'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { UCUM_UNITS } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { UCUM_VALUE_SET } from './doctor-api';
import type { Term } from './doctor-types';
import { useUnitLabel } from './unit-label';
import { ValueSetSelect } from './value-set-select';

interface UcumUnitSelectProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (unit: string) => void;
  readonly onBlur?: () => void;
  readonly observationCode?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
}

export const UcumUnitSelect = forwardRef<HTMLSelectElement, UcumUnitSelectProps>(function UcumUnitSelect({ onChange, observationCode, ...rest }, ref): ReactNode {
  const t = useT('doctor.ucum');
  const unitLabel = useUnitLabel();
  const optionLabel = (term: Term): string => {
    const label: string = unitLabel(term.code, observationCode);
    return term.display && label !== term.display ? `${label} — ${term.display}` : label;
  };
  return (
    <ValueSetSelect
      ref={ref}
      {...rest}
      valueSet={UCUM_VALUE_SET}
      placeholder={t('placeholder')}
      fallbackCodes={UCUM_UNITS}
      optionLabel={optionLabel}
      onChange={(term) => onChange(term?.code ?? '')}
    />
  );
});
