import { buttonVariants } from '@/components/ui/button-variants';
import { FIELD_CLASS } from '@/components/ui/field-styles';

export const CONTROL_CLASS = FIELD_CLASS;

export const PRIMARY_BUTTON_CLASS = buttonVariants({ variant: 'primary' });

export const SECONDARY_BUTTON_CLASS = buttonVariants({ variant: 'secondary' });

export const PANEL_CLASS = 'rounded-card border border-[var(--border)] bg-[var(--card)] p-5';
