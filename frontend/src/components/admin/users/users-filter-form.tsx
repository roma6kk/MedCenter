'use client';

import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS } from '../shared/admin-styles';
import { useDebouncedCommit } from '../shared/use-debounced-commit';
import { USER_ROLES, type UserRole } from './user-types';

interface UsersFilterFormProps {
  readonly role: UserRole | '';
  readonly search: string;
  readonly onApply: (role: UserRole | '', search: string) => void;
}

/**
 * Role and text search of the user list, both applied as they are changed: the role is a chip (one decision, applied at
 * once), the text follows once typing pauses, Enter applies it immediately. There is no «Применить» button.
 */
export function UsersFilterForm({ role, search, onApply }: UsersFilterFormProps): ReactNode {
  const t = useT('admin.users');
  const searchId = useId();
  const [draftSearch, setDraftSearch] = useState<string>(search);
  useDebouncedCommit(draftSearch.trim(), search, (next) => onApply(role, next));
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (draftSearch.trim() !== search) onApply(role, draftSearch.trim());
  };
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={handleSubmit} className="no-print mb-4 flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="grid gap-1.5">
        <label htmlFor={searchId} className="form-label">{t('filters.search')}</label>
        <input id={searchId} type="search" value={draftSearch} maxLength={100} autoComplete="off" onChange={(event) => setDraftSearch(event.target.value)} className={`${CONTROL_CLASS} w-72 max-w-full`} />
      </div>
      <div className="grid gap-1.5">
        <span aria-hidden="true" className="form-label">{t('filters.role')}</span>
        <SegmentedControl<UserRole | 'any'>
          kind="toggle"
          label={t('filters.role')}
          value={role === '' ? 'any' : role}
          onChange={(next) => onApply(next === 'any' ? '' : next, draftSearch.trim())}
          options={[{ value: 'any', label: t('filters.anyRole') }, ...USER_ROLES.map((value) => ({ value, label: t(`roleNames.${value}`) }))]}
        />
      </div>
    </form>
  );
}
