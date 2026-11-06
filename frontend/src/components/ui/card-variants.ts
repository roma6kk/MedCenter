import { cva, type VariantProps } from 'class-variance-authority';

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

// Stretches the card link over the whole card via ::after on the nearest relative ancestor: one tab stop, no nested interactive markup.
export const STRETCHED_LINK_CLASS = "after:absolute after:inset-0 after:content-['']";
