import { buttonVariants } from '@/components/ui/button-variants';
import { FIELD_CLASS } from '@/components/ui/field-styles';

/** Shared class names of the admin screens, so every form control and button looks the same (design canvas «calm clinic»). */

/** The admin forms use the one shared field look (`ui/field-styles.ts`); the name stays for the many call sites. */
export const CONTROL_CLASS = FIELD_CLASS;

export const PRIMARY_BUTTON_CLASS = buttonVariants({ variant: 'primary' });

export const SECONDARY_BUTTON_CLASS = buttonVariants({ variant: 'secondary' });

export const PANEL_CLASS = 'rounded-card border border-[var(--border)] bg-[var(--card)] p-5';
