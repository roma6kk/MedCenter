'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ATC_PATTERN } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { ATC_VALUE_SET } from './doctor-api';
import type { Term } from './doctor-types';
import { TerminologyCombobox } from './terminology-combobox';

interface AtcCodeFieldProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly onSelectTerm?: (term: Term) => void;
  readonly onBlur?: () => void;
  readonly id: string;
  readonly labelSuffix?: string;
  readonly error?: string;
}

const ATC_LENGTH = 7;

/**
 * АТХ (ATC) code of a drug (FR-014, BR-009): monospace, upper-cased as typed, suggestions with the drug name from the
 * `atc` ValueSet. The service checks the code against the seeded ValueSet on submit.
 */
export const AtcCodeField = forwardRef<HTMLInputElement, AtcCodeFieldProps>(function AtcCodeField(
  { value, onChange, onSelectTerm, onBlur, id, labelSuffix, error },
  ref,
): ReactNode {
  const t = useT('doctor.atc');
  return (
    <TerminologyCombobox
      ref={ref}
      id={id}
      label={labelSuffix ? `${t('label')} · ${labelSuffix}` : t('label')}
      valueSet={ATC_VALUE_SET}
      value={value}
      onChange={onChange}
      onSelectTerm={onSelectTerm}
      onBlur={onBlur}
      pattern={ATC_PATTERN}
      invalidMessage={t('invalid')}
      listLabel={t('options')}
      placeholder={t('placeholder')}
      maxLength={ATC_LENGTH}
      normalize={(raw) => raw.toUpperCase()}
      error={error}
    />
  );
});
