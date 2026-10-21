import { buttonVariants } from '@/components/ui/button-variants';

/** Shared class names of the admin screens, so every form control and button looks the same (design canvas «calm clinic»). */

export const CONTROL_CLASS =
  'min-h-[44px] w-full rounded-control border border-[var(--input)] bg-[var(--card)] px-3 py-1.5 text-sm disabled:opacity-60 aria-disabled:opacity-60';

export const PRIMARY_BUTTON_CLASS = buttonVariants({ variant: 'primary' });

export const SECONDARY_BUTTON_CLASS = buttonVariants({ variant: 'secondary' });

export const DANGER_BUTTON_CLASS = 'inline-flex min-h-[44px] items-center justify-center rounded-control bg-[var(--destructive)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 aria-disabled:opacity-60';

export const ROW_ACTION_CLASS = 'min-h-[44px] whitespace-nowrap rounded-control px-2 text-left text-sm font-medium text-primary-soft-foreground underline underline-offset-2 hover:text-[var(--foreground)]';

export const PANEL_CLASS = 'rounded-card border border-[var(--border)] bg-[var(--card)] p-5';
