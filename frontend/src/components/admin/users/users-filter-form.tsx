'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS, SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { USER_ROLES, type UserRole } from './user-types';

interface UsersFilterFormProps {
  readonly role: UserRole | '';
  readonly search: string;
  readonly onApply: (role: UserRole | '', search: string) => void;
}

/** Role + text search of the user list. The search runs on submit (Enter or «Найти»), not on every keystroke. */
export function UsersFilterForm({ role, search, onApply }: UsersFilterFormProps): ReactNode {
  const t = useT('admin.users');
  const [draftRole, setDraftRole] = useState<UserRole | ''>(role);
  const [draftSearch, setDraftSearch] = useState<string>(search);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onApply(draftRole, draftSearch);
  };
  return (
    <form role="search" aria-label={t('filters.label')} onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <label htmlFor="users-filter-search" className="form-label">{t('filters.search')}</label>
        <input id="users-filter-search" type="search" value={draftSearch} maxLength={100} onChange={(event) => setDraftSearch(event.target.value)} className={`${CONTROL_CLASS} w-64`} />
      </div>
      <div className="grid gap-1">
        <label htmlFor="users-filter-role" className="form-label">{t('filters.role')}</label>
        <select id="users-filter-role" value={draftRole} onChange={(event) => setDraftRole(event.target.value as UserRole | '')} className={CONTROL_CLASS}>
          <option value="">{t('filters.anyRole')}</option>
          {USER_ROLES.map((value) => (
            <option key={value} value={value}>{t(`roleNames.${value}`)}</option>
          ))}
        </select>
      </div>
      <button type="submit" className={SECONDARY_BUTTON_CLASS}>{t('filters.apply')}</button>
    </form>
  );
}
