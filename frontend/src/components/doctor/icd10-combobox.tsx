'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ICD10_PATTERN } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { ICD10_VALUE_SET } from './doctor-api';
import type { Term } from './doctor-types';
import { TerminologyCombobox } from './terminology-combobox';

interface Icd10ComboboxProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly onSelectTerm?: (term: Term) => void;
  readonly onBlur?: () => void;
  readonly id?: string;
  /** Distinguishes several diagnosis rows for assistive technology (`диагноз 2`). */
  readonly labelSuffix?: string;
  readonly error?: string;
}

/** `j06.9` is meant as `J06.9`; free text (a diagnosis name being searched) is left alone. */
function upperCaseCode(raw: string): string {
  return /^[a-z][0-9]/i.test(raw) ? raw.toUpperCase() : raw;
}

/**
 * ICD-10 code field (FR-012, BR-004): suggestions from the `InternClassificDiseases10` ValueSet by code or name, the
 * client mask `^[A-Z]\d{2}(\.\d{1,2})?$`, and the display name handed to `onSelectTerm`.
 */
export const Icd10Combobox = forwardRef<HTMLInputElement, Icd10ComboboxProps>(function Icd10Combobox(
  { value, onChange, onSelectTerm, onBlur, id = 'icd10', labelSuffix, error },
  ref,
): ReactNode {
  const t = useT('doctor.icd10');
  return (
    <TerminologyCombobox
      ref={ref}
      id={id}
      label={labelSuffix ? `${t('label')} · ${labelSuffix}` : t('label')}
      valueSet={ICD10_VALUE_SET}
      value={value}
      onChange={onChange}
      onSelectTerm={onSelectTerm}
      onBlur={onBlur}
      pattern={ICD10_PATTERN}
      invalidMessage={t('invalid')}
      listLabel={t('options')}
      placeholder={t('placeholder')}
      normalize={upperCaseCode}
      error={error}
    />
  );
});
