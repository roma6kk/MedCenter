import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Look of every surface of the redesign, kept out of the component file so a `Link` or a `button` can wear it too
 * (`<Link className={cardVariants({ tone: 'interactive' })}>`) and so Fast Refresh keeps `card.tsx` components-only.
 *
 * `tone` tells the eye what the card does: `static` only holds content, `interactive` is clickable as a whole (hover lifts it
 * 2 px onto a deeper shadow, a press puts it back down, the pointer and a focus ring say so), `selected` is the chosen one of a group. Only the
 * properties that change are transitioned (never `all`); the global reduced-motion rule makes the lift instant.
 */
export const cardVariants = cva('relative border bg-card shadow-elev-1', {
  variants: {
    radius: { card: 'rounded-card', panel: 'rounded-panel' },
    padding: { none: '', md: 'p-5', lg: 'p-6' },
    tone: {
      static: 'border-border-soft',
      interactive:
        'cursor-pointer border-border-soft transition-[transform,box-shadow,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-border hover:shadow-elev-2 active:translate-y-0 active:shadow-elev-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      selected: 'border-primary bg-primary-soft shadow-elev-1 ring-2 ring-primary',
    },
  },
  defaultVariants: { radius: 'card', padding: 'md', tone: 'static' },
});

export type CardVariantProps = VariantProps<typeof cardVariants>;

/**
 * Makes the one link of an interactive card cover the whole card (`after` pseudo-element over the nearest `relative`
 * ancestor, which `Card` is): a single tab stop and a single accessible name, and no nested interactive markup.
 */
export const STRETCHED_LINK_CLASS = "after:absolute after:inset-0 after:content-['']";
