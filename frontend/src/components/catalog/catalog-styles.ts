import { buttonVariants } from '@/components/ui/button-variants';

/** Tailwind classes shared by the catalog and booking components (kept out of component files: Fast Refresh needs components-only modules). */
export const SECONDARY_BUTTON_CLASS = buttonVariants({ variant: 'secondary' });

/** Width and side padding of a landing section's content; the band behind it may be full-bleed. */
export const SECTION_CLASS = 'mx-auto w-full max-w-[1200px] px-6';

/** Heading and lead shared by every landing section. */
export const SECTION_TITLE_CLASS = 'text-3xl font-bold tracking-tight';
export const SECTION_LEAD_CLASS = 'mt-2 text-lg text-muted-foreground';
