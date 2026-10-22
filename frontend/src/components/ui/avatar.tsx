'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface AvatarProps {
  /** Portrait URL (same-origin: the CSP allows `img-src 'self'`); without it, or when it fails to load, the initials show. */
  readonly src?: string;
  readonly initials: string;
  /** Size and text classes of the round tile, e.g. `h-14 w-14 text-lg`. */
  readonly className: string;
}

/** Round decorative avatar: the person's portrait, else initials on a soft teal tile. The name is always next to it, hence no alt text. */
export function Avatar({ src, initials, className }: AvatarProps): ReactNode {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const showPhoto: boolean = src !== undefined && src !== failedSrc;
  return (
    <span
      aria-hidden="true"
      className={cn('flex flex-none items-center justify-center overflow-hidden rounded-full bg-primary-soft font-bold text-primary-soft-foreground', className)}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 128px static portrait; next/image would add an optimizer round trip for nothing
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        initials
      )}
    </span>
  );
}
