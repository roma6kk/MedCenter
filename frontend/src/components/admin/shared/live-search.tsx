'use client';

import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS } from './admin-styles';
import { useDebouncedCommit } from './use-debounced-commit';

interface LiveSearchProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function LiveSearch({ label, value, onChange }: LiveSearchProps): ReactNode {
  const t = useT('admin.common');
  const inputId = useId();
  const [draft, setDraft] = useState<string>(value);
  useDebouncedCommit(draft.trim(), value, onChange);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (draft.trim() !== value) onChange(draft.trim());
  };
  return (
    <form role="search" aria-label={t('search')} onSubmit={handleSubmit} className="no-print mb-5 flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <label htmlFor={inputId} className="form-label">{label}</label>
        <input id={inputId} type="search" value={draft} maxLength={100} autoComplete="off" onChange={(event) => setDraft(event.target.value)} className={`${CONTROL_CLASS} w-72 max-w-full`} />
      </div>
    </form>
  );
}
