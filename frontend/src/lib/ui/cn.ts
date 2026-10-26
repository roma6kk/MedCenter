import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The elevation and duration keys of `tailwind.config.ts` are custom: without them `cn('shadow-elev-1', 'shadow-elev-2')`
// would keep both classes and leave the winner to the order of the generated CSS.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['elev-1', 'elev-2', 'elev-3', 'focus', 'focus-danger'] }],
      duration: [{ duration: ['fast', 'base', 'slow'] }],
    },
  },
});

/** Joins class names and lets the last Tailwind utility of a group win (`cn('px-4', 'px-6')` is `px-6`). */
export function cn(...inputs: ReadonlyArray<ClassValue>): string {
  return twMerge(clsx(inputs));
}
