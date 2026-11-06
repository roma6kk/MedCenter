'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

interface AvatarProps {
  readonly src?: string;
  readonly initials: string;
  readonly className: string;
}

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
