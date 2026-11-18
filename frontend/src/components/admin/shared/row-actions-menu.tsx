'use client';

import type { ReactNode } from 'react';
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/use-t';

interface RowActionsMenuProps {
  readonly name: string;
  readonly items: ReadonlyArray<MenuItem>;
}

export function RowActionsMenu({ name, items }: RowActionsMenuProps): ReactNode {
  const t = useT('admin.common');
  return <DropdownMenu label={t('rowActions', { name })} items={items} />;
}
