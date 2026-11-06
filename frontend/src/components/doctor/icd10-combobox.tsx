'use client';

import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ICD10_PATTERN } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { ICD10_VALUE_SET } from './doctor-api';
import type { Term } from './doctor-types';
import { upperCaseCode } from './icd10-text';
import { TerminologyCombobox } from './terminology-combobox';

interface Icd10ComboboxProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly onSelectTerm?: (term: Term) => void;
  readonly onBlur?: () => void;
  readonly id?: string;
  readonly labelSuffix?: string;
  readonly label?: string;
  readonly error?: string;
  readonly text?: string;
  readonly onTextChange?: (raw: string) => void;
  readonly shortcuts?: ReadonlyArray<Term>;
  readonly shortcutsLabel?: string;
}

export const Icd10Combobox = forwardRef<HTMLInputElement, Icd10ComboboxProps>(function Icd10Combobox(
  { value, onChange, onSelectTerm, onBlur, id = 'icd10', labelSuffix, label, error, text: inputText, onTextChange, shortcuts, shortcutsLabel },
  ref,
): ReactNode {
  const t = useT('doctor.icd10');
  return (
    <TerminologyCombobox
      ref={ref}
      id={id}
      label={label ?? (labelSuffix ? `${t('label')} · ${labelSuffix}` : t('label'))}
      valueSet={ICD10_VALUE_SET}
      value={value}
      onChange={onChange}
      onSelectTerm={onSelectTerm}
      onBlur={onBlur}
      pattern={ICD10_PATTERN}
      invalidMessage={inputText === undefined ? t('invalid') : t('pick')}
      listLabel={t('options')}
      placeholder={t('placeholder')}
      normalize={upperCaseCode}
      error={error}
      text={inputText}
      onTextChange={onTextChange}
      shortcuts={shortcuts}
      shortcutsLabel={shortcutsLabel}
    />
  );
});
