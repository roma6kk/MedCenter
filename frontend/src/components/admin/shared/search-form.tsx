'use client';

import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS, SECONDARY_BUTTON_CLASS } from './admin-styles';

interface SearchFormProps {
  readonly label: string;
  readonly value: string;
  readonly onApply: (value: string) => void;
}

/** A text filter applied on submit (Enter or «Найти»), not on every keystroke, so a list is not refetched per letter. */
export function SearchForm({ label, value, onApply }: SearchFormProps): ReactNode {
  const t = useT('admin.common');
  const inputId = useId();
  const [draft, setDraft] = useState<string>(value);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onApply(draft.trim());
  };
  return (
    <form role="search" aria-label={t('search')} onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <label htmlFor={inputId} className="form-label">{label}</label>
        <input id={inputId} type="search" value={draft} maxLength={100} onChange={(event) => setDraft(event.target.value)} className={`${CONTROL_CLASS} w-64`} />
      </div>
      <button type="submit" className={SECONDARY_BUTTON_CLASS}>{t('find')}</button>
    </form>
  );
}
