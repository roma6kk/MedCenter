import type { ReactNode } from 'react';
import { PRIMARY_BUTTON_CLASS } from './admin-styles';

interface CreateButtonProps {
  readonly label: string;
  readonly onClick: () => void;
}

/** The primary call to action of an admin list («Создать …»), the `action` of `AdminPageHeader`. */
export function CreateButton({ label, onClick }: CreateButtonProps): ReactNode {
  return (
    <button type="button" onClick={onClick} className={PRIMARY_BUTTON_CLASS}>
      {label}
    </button>
  );
}
